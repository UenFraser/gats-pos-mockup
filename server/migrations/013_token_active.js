// Table tokens can be switched off (a smaller dining room) without deleting them, so old sales still point at a real token.
exports.up = (db) => db.exec(`
ALTER TABLE tokens ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1));
`);
