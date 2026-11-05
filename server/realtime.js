// Rooms and "emit only after the database write succeeded".
// Clients never emit business events; they call REST routes and the server emits.
const log = require('./log');

const ROOMS_BY_ROLE = {
  KDS: ['role:kitchen'],
  WAITER: ['role:waiter'],
  CASHIER: ['role:cashier'],
  MANAGER: ['role:cashier', 'role:manager'], // managers see everything cashiers see
};

function createRealtime(io) {
  // socketAuth has already put the user on socket.user
  io.on('connection', (socket) => {
    const u = socket.user;
    socket.join([`user:${u.id}`, ...(ROOMS_BY_ROLE[u.role] || [])]);
    log.info(`socket connected: ${u.username} (${u.role})`);
    socket.on('disconnect', (why) => log.info(`socket disconnected: ${u.username} (${why})`));
  });

  let pending = null; // emits collected while a transaction is running

  // Use anywhere. Inside rt.transaction() the emit waits for the commit.
  function emitAfterCommit(room, event, payload) {
    if (pending) pending.push([room, event, payload]);
    else io.to(room).emit(event, payload);
  }

  // Wrap a better-sqlite3 write in this. Emits fire only if it commits; a throw drops them.
  // fn must be synchronous (better-sqlite3 requires that anyway).
  function transaction(db, fn) {
    if (pending) return db.transaction(fn)(); // nested: join the outer one
    pending = [];
    try {
      const result = db.transaction(fn)();
      const toSend = pending;
      pending = null;
      for (const [room, event, payload] of toSend) io.to(room).emit(event, payload);
      return result;
    } catch (err) {
      pending = null;
      throw err;
    }
  }

  const sockets = () => [...io.sockets.sockets.values()];
  const disconnectToken = (token) =>
    sockets().filter((s) => s.handshake.auth && s.handshake.auth.token === token).forEach((s) => s.disconnect(true));
  const disconnectUser = (userId) =>
    sockets().filter((s) => s.user && s.user.id === userId).forEach((s) => s.disconnect(true));

  return { emitAfterCommit, transaction, disconnectToken, disconnectUser };
}

module.exports = { createRealtime };
