const { branchId, newId, nowIso } = require('../db');

// Who is TOLD about a change: the other side of whoever made it.
//   waiter changes a tab  -> cashier is told        cashier/manager changes a tab -> waiters are told
const audienceFor = (actorRole) => (actorRole === 'WAITER' ? 'CASHIER' : 'WAITER');
// Which notifications a logged-in person SEES: waiters see the waiter ones, cashier and manager the cashier ones.
const audienceOfViewer = (role) => (role === 'WAITER' ? 'WAITER' : 'CASHIER');
const ROOM = { CASHIER: 'role:cashier', WAITER: 'role:waiter' };

// type: ADD (green) | VOID (red) | SWAP (blue). Call inside rt.transaction(): the event waits for the commit.
function notify(db, rt, { sessionId, tokenNumber, actor, type, summary }) {
  const audience = audienceFor(actor.role);
  const id = newId();
  db.prepare(`INSERT INTO session_notifications (id, branch_id, session_id, audience, type, summary, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, branchId(db), sessionId, audience, type, String(summary).slice(0, 300), actor.id, nowIso());
  rt.emitAfterCommit(ROOM[audience], 'notification:new',
    { id, audience, sessionId, tokenNumber, type, summary, by: actor.displayName });
  return id;
}

// { sessionId -> { ADD: n, VOID: n, SWAP: n } } of unread ones for this audience.
function unreadCounts(db, audience) {
  const map = new Map();
  const rows = db.prepare(`SELECT session_id, type, COUNT(*) AS c FROM session_notifications
                            WHERE audience = ? AND read_at IS NULL GROUP BY session_id, type`).all(audience);
  for (const r of rows) {
    if (!map.has(r.session_id)) map.set(r.session_id, {});
    map.get(r.session_id)[r.type] = r.c;
  }
  return map;
}

function listUnread(db, sessionId, audience) {
  return db.prepare(`SELECT n.id, n.type, n.summary, n.created_at, u.display_name AS by_name
                       FROM session_notifications n JOIN users u ON u.id = n.created_by
                      WHERE n.session_id = ? AND n.audience = ? AND n.read_at IS NULL
                      ORDER BY n.created_at, n.rowid`).all(sessionId, audience)
    .map((n) => ({ id: n.id, type: n.type, summary: n.summary, createdAt: n.created_at, by: n.by_name }));
}

// "Clears when the user clicks it to view it": one call marks everything unread on that tab as read.
function markRead(db, rt, user, sessionId) {
  const audience = audienceOfViewer(user.role);
  return rt.transaction(db, () => {
    const r = db.prepare(`UPDATE session_notifications SET read_at = ?, read_by = ?
                           WHERE session_id = ? AND audience = ? AND read_at IS NULL`).run(nowIso(), user.id, sessionId, audience);
    if (r.changes > 0) rt.emitAfterCommit(ROOM[audience], 'session:updated', { sessionId, reason: 'read' });
    return { success: true, count: r.changes };
  });
}

module.exports = { notify, unreadCounts, listUnread, markRead, audienceFor, audienceOfViewer };
