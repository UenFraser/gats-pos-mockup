const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');

const MAX_TRAYS = 9;
const FRONT = ['role:cashier', 'role:waiter']; // front of house (managers are in both)

const stateOf = (r) => (r.ready_at ? 'READY' : 'REQUESTED');

function listActive(db) {
  return db.prepare(`
    SELECT i.id, i.token_id, t.token_number, t.zone, i.trays, i.status, i.created_at, i.ready_at, u.display_name AS requested_by
      FROM ice_requests i JOIN tokens t ON t.id = i.token_id JOIN users u ON u.id = i.requested_by
     WHERE i.status = 'REQUESTED' AND i.branch_id = ?
     ORDER BY i.created_at, i.rowid`).all(branchId(db)).map((r) => ({
    id: r.id, tokenId: r.token_id, tokenNumber: r.token_number, zone: r.zone, trays: r.trays,
    state: stateOf(r), requestedBy: r.requested_by, createdAt: r.created_at, readyAt: r.ready_at,
  }));
}

function load(db, id) {
  const r = db.prepare(`SELECT i.id, i.status, i.ready_at, i.trays, t.token_number
                          FROM ice_requests i JOIN tokens t ON t.id = i.token_id WHERE i.id = ? AND i.branch_id = ?`).get(id, branchId(db));
  if (!r) throw new HttpError(404, 'Ice request not found');
  return r;
}

// Front of house asks for ice for a table. One request per table at a time (stops accidental double taps).
function requestIce(db, rt, user, body) {
  if (!body || typeof body.tokenId !== 'string') throw new HttpError(400, 'Choose a table');
  const trays = body.trays === undefined ? 1 : body.trays;
  if (!Number.isInteger(trays) || trays < 1 || trays > MAX_TRAYS) throw new HttpError(400, `Trays must be 1 to ${MAX_TRAYS}`);
  const token = db.prepare('SELECT id, token_number FROM tokens WHERE id = ? AND branch_id = ?').get(body.tokenId, branchId(db));
  if (!token) throw new HttpError(404, 'Unknown table');
  return rt.transaction(db, () => {
    if (db.prepare("SELECT 1 FROM ice_requests WHERE token_id = ? AND status = 'REQUESTED'").get(token.id))
      throw new HttpError(409, `Ice for ${token.token_number} is already on its way`);
    const id = newId();
    db.prepare('INSERT INTO ice_requests (id, branch_id, token_id, trays, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, branchId(db), token.id, trays, 'REQUESTED', user.id, nowIso());
    rt.emitAfterCommit('role:kitchen', 'ice:requested', { id, tokenNumber: token.token_number, trays });
    rt.emitAfterCommit('all', 'ice:changed', { id });
    return { success: true, id };
  });
}

// Kitchen: the ice is prepared and waiting at the counter.
function markReady(db, rt, user, id) {
  return rt.transaction(db, () => {
    const r = load(db, id);
    if (r.status !== 'REQUESTED') throw new HttpError(409, 'This ice request is already finished');
    if (r.ready_at) return { success: true, already: true };
    db.prepare('UPDATE ice_requests SET ready_at = ?, ready_by = ? WHERE id = ?').run(nowIso(), user.id, id);
    rt.emitAfterCommit(FRONT, 'ice:ready', { id, tokenNumber: r.token_number, trays: r.trays });
    rt.emitAfterCommit('all', 'ice:changed', { id });
    return { success: true };
  });
}

// Front of house: the ice reached the table. (Allowed even if the kitchen forgot to tap Ready.)
function markDelivered(db, rt, user, id) {
  return rt.transaction(db, () => {
    const r = load(db, id);
    if (r.status === 'DELIVERED') return { success: true, already: true };
    if (r.status !== 'REQUESTED') throw new HttpError(409, 'This ice request was cancelled');
    db.prepare("UPDATE ice_requests SET status = 'DELIVERED', delivered_by = ?, delivered_at = ? WHERE id = ?").run(user.id, nowIso(), id);
    rt.emitAfterCommit('all', 'ice:changed', { id });
    return { success: true };
  });
}

function cancel(db, rt, user, id) {
  return rt.transaction(db, () => {
    const r = load(db, id);
    if (r.status === 'CANCELLED') return { success: true, already: true };
    if (r.status !== 'REQUESTED') throw new HttpError(409, 'This ice was already delivered');
    db.prepare("UPDATE ice_requests SET status = 'CANCELLED' WHERE id = ?").run(id);
    rt.emitAfterCommit('all', 'ice:changed', { id });
    return { success: true };
  });
}

// Nudge the kitchen about ice that is taking long. Only the kitchen hears it.
function followUp(db, rt, user, id) {
  const r = load(db, id);
  if (r.status !== 'REQUESTED') throw new HttpError(409, 'This ice request is already finished');
  if (r.ready_at) throw new HttpError(409, 'The ice is already ready at the counter');
  rt.emitAfterCommit('role:kitchen', 'ice:follow-up', { id, tokenNumber: r.token_number });
  return { success: true };
}

module.exports = { listActive, requestIce, markReady, markDelivered, cancel, followUp };
