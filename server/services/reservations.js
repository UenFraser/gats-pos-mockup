const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { businessDate } = require('./businessTime');
const { getBillingSettings } = require('./settings');
const { queue } = require('./outbox');

// A reservation is a tab in status RESERVED. It holds the table until the guests are seated
// (then it becomes an ordinary OPEN tab) or it is cancelled.
const text = (v, max, label, required = false) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (required && !t) throw new HttpError(400, `${label} is required`);
  if (t.length > max) throw new HttpError(400, `${label} is too long`);
  return t || null;
};

function parseTime(v) {
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) throw new HttpError(400, 'Choose the reservation time');
  // Today only: a held table cannot be used by anyone else, so a table is never held for days.
  if (ms < Date.now() - 60 * 60 * 1000) throw new HttpError(422, 'That time has already passed');
  if (businessDate(new Date(ms)) !== businessDate(new Date())) throw new HttpError(422, 'Reservations are for today only (the table is held until the guests arrive)');
  return new Date(ms).toISOString();
}
function parseParty(v) {
  if (v === undefined || v === null || v === '') return null;
  if (!Number.isInteger(v) || v < 1 || v > 50) throw new HttpError(400, 'Party size must be 1 to 50');
  return v;
}

function reservation(db, id) {
  const s = db.prepare(`SELECT s.id, s.status, s.token_id, t.token_number, t.zone FROM sessions s JOIN tokens t ON t.id = s.token_id
                         WHERE s.id = ? AND s.branch_id = ?`).get(id, branchId(db));
  if (!s) throw new HttpError(404, 'Reservation not found');
  if (s.status !== 'RESERVED') throw new HttpError(409, 'This reservation is no longer waiting');
  return s;
}

function list(db) {
  return db.prepare(`
    SELECT s.id, s.token_id, t.token_number, t.zone, s.customer_name, s.customer_phone, s.party_size, s.reservation_time, s.reservation_fee_cents, u.display_name AS taken_by
      FROM sessions s JOIN tokens t ON t.id = s.token_id LEFT JOIN users u ON u.id = s.opened_by
     WHERE s.status = 'RESERVED' AND s.branch_id = ? ORDER BY s.reservation_time, s.rowid`).all(branchId(db)).map((r) => ({
    id: r.id, tokenId: r.token_id, tokenNumber: r.token_number, zone: r.zone, name: r.customer_name, phone: r.customer_phone,
    partySize: r.party_size, time: r.reservation_time, feeCents: r.reservation_fee_cents, takenBy: r.taken_by,
  }));
}

function create(db, rt, user, body) {
  if (!body || typeof body.tokenId !== 'string') throw new HttpError(400, 'Choose a table');
  const name = text(body.name, 60, 'The guest name', true);
  const phone = text(body.phone, 30, 'The phone number');
  const party = parseParty(body.partySize);
  const time = parseTime(body.time);
  return rt.transaction(db, () => {
    const token = db.prepare('SELECT id, token_number, zone FROM tokens WHERE id = ? AND branch_id = ?').get(body.tokenId, branchId(db));
    if (!token) throw new HttpError(404, 'Unknown table');
    if (token.zone === 'TAKEOUT') throw new HttpError(422, 'Takeout tokens cannot be reserved');
    if (db.prepare("SELECT 1 FROM sessions WHERE token_id = ? AND status IN ('RESERVED','OPEN')").get(token.id))
      throw new HttpError(409, `${token.token_number} is not free right now`);
    const id = newId();
    db.prepare(`INSERT INTO sessions (id, branch_id, token_id, status, business_date, opened_by, customer_name, customer_phone, party_size, reservation_time, reservation_fee_cents)
                VALUES (?, ?, ?, 'RESERVED', ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, branchId(db), token.id, businessDate(new Date(time)), user.id, name, phone, party, time, getBillingSettings(db).feeCents);
    queue(db, 'session', 'sessions', id, 'insert');
    rt.emitAfterCommit('all', 'token:changed', { tokenId: token.id, status: 'RESERVED', sessionId: id });
    rt.emitAfterCommit('all', 'reservation:changed', { id });
    return { success: true, id };
  });
}

function update(db, rt, user, id, body) {
  const b = body || {};
  return rt.transaction(db, () => {
    reservation(db, id);
    const sets = []; const vals = [];
    if (b.name !== undefined) { sets.push('customer_name = ?'); vals.push(text(b.name, 60, 'The guest name', true)); }
    if (b.phone !== undefined) { sets.push('customer_phone = ?'); vals.push(text(b.phone, 30, 'The phone number')); }
    if (b.partySize !== undefined) { sets.push('party_size = ?'); vals.push(parseParty(b.partySize)); }
    if (b.time !== undefined) { sets.push('reservation_time = ?'); vals.push(parseTime(b.time)); }
    if (!sets.length) throw new HttpError(400, 'Nothing to change');
    db.prepare(`UPDATE sessions SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, nowIso(), id);
    queue(db, 'session', 'sessions', id, 'update');
    rt.emitAfterCommit('all', 'reservation:changed', { id });
    return { success: true };
  });
}

function cancel(db, rt, user, id) {
  return rt.transaction(db, () => {
    const r = reservation(db, id);
    const now = nowIso();
    db.prepare("UPDATE sessions SET status = 'CANCELLED', cancelled_by = ?, closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ?").run(user.id, user.id, now, now, id);
    queue(db, 'session', 'sessions', id, 'update');
    rt.emitAfterCommit('all', 'token:changed', { tokenId: r.token_id, status: 'FREE', sessionId: null });
    rt.emitAfterCommit('all', 'reservation:changed', { id });
    return { success: true };
  });
}

// The guests arrived: the reserved tab becomes an ordinary open tab (the fee stays on it).
function seat(db, rt, user, id) {
  return rt.transaction(db, () => {
    const r = reservation(db, id);
    const now = nowIso();
    db.prepare("UPDATE sessions SET status = 'OPEN', business_date = ?, updated_at = ? WHERE id = ?").run(businessDate(new Date(now)), now, id);
    queue(db, 'session', 'sessions', id, 'update');
    rt.emitAfterCommit('all', 'token:changed', { tokenId: r.token_id, status: 'OPEN', sessionId: id });
    rt.emitAfterCommit('all', 'reservation:changed', { id });
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId: id, reason: 'seated' });
    return { success: true, sessionId: id };
  });
}

module.exports = { list, create, update, cancel, seat };
