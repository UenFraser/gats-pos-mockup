// Every change is also queued for HQ sync, in the SAME transaction (see sync_outbox in migration 001).
function queue(db, entity, table, id, op) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  db.prepare('INSERT INTO sync_outbox (entity, entity_id, op, payload) VALUES (?, ?, ?, ?)')
    .run(entity, id, op, JSON.stringify(row));
}
module.exports = { queue };
