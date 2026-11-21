// Settings > Tables: how many table tokens each zone has. More = reactivate switched-off ones first, then create new numbers.
// Fewer = switch off the highest numbers (only when they are free). Nothing is ever deleted: old sales keep their token.
const { branchId, newId } = require('../db');
const { HttpError } = require('./errors');
const { queue } = require('./outbox');

const LETTER = { RESTAURANT: 'R', BAR: 'B', TAKEOUT: 'T' };
const MIN_PER_ZONE = 1;
const MAX_PER_ZONE = 60;
const num = (t) => parseInt(String(t.token_number).slice(1), 10);

function rows(db) {
  return db.prepare(`
    SELECT t.id, t.token_number, t.zone, t.active,
           EXISTS (SELECT 1 FROM sessions s WHERE s.token_id = t.id AND s.status IN ('RESERVED','OPEN')) AS in_use,
           EXISTS (SELECT 1 FROM ice_requests i WHERE i.token_id = t.id AND i.status = 'REQUESTED') AS ice
      FROM tokens t WHERE t.branch_id = ?`).all(branchId(db));
}

function summary(db) {
  const all = rows(db);
  return Object.keys(LETTER).map((zone) => {
    const mine = all.filter((t) => t.zone === zone).sort((a, b) => num(a) - num(b));
    const active = mine.filter((t) => t.active);
    return {
      zone, letter: LETTER[zone], count: active.length, min: MIN_PER_ZONE, max: MAX_PER_ZONE,
      numbers: active.map((t) => t.token_number), inUse: active.filter((t) => t.in_use || t.ice).map((t) => t.token_number),
    };
  });
}

function setZoneCount(db, rt, user, zone, count) {
  if (!LETTER[zone]) throw new HttpError(400, 'Choose a zone');
  if (!Number.isInteger(count) || count < MIN_PER_ZONE || count > MAX_PER_ZONE) throw new HttpError(400, `A zone needs ${MIN_PER_ZONE} to ${MAX_PER_ZONE} tables`);
  return rt.transaction(db, () => {
    const mine = rows(db).filter((t) => t.zone === zone).sort((a, b) => num(a) - num(b));
    const active = mine.filter((t) => t.active);

    if (count > active.length) {
      let need = count - active.length;
      for (const t of mine.filter((x) => !x.active)) {            // switched-off ones come back first (lowest number first)
        if (need === 0) break;
        db.prepare('UPDATE tokens SET active = 1 WHERE id = ?').run(t.id);
        queue(db, 'token', 'tokens', t.id, 'update');
        need -= 1;
      }
      let next = Math.max(0, ...mine.map(num)) + 1;               // then brand-new numbers after the highest ever used
      while (need > 0) {
        const id = newId();
        db.prepare('INSERT INTO tokens (id, branch_id, token_number, zone) VALUES (?, ?, ?, ?)').run(id, branchId(db), `${LETTER[zone]}${next}`, zone);
        queue(db, 'token', 'tokens', id, 'insert');
        next += 1; need -= 1;
      }
    } else if (count < active.length) {
      const drop = active.slice().sort((a, b) => num(b) - num(a)).slice(0, active.length - count); // the highest numbers
      const busy = drop.filter((t) => t.in_use || t.ice);
      if (busy.length) throw new HttpError(409, `${busy.map((t) => t.token_number).join(', ')} ${busy.length > 1 ? 'are' : 'is'} in use. Close ${busy.length > 1 ? 'them' : 'it'} first, then try again.`);
      for (const t of drop) {
        db.prepare('UPDATE tokens SET active = 0 WHERE id = ?').run(t.id);
        queue(db, 'token', 'tokens', t.id, 'update');
      }
    }
    rt.emitAfterCommit('all', 'tokens:changed', { zone });
    return { success: true, zones: summary(db) };
  });
}

module.exports = { summary, setZoneCount, LETTER };
