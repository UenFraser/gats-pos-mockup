// Tiny logger facade. electron/main.js plugs in electron-log; anywhere else it is the console.
let impl = console;
module.exports = {
  setLogger(l) { impl = l; },
  info: (...a) => impl.info(...a),
  warn: (...a) => impl.warn(...a),
  error: (...a) => impl.error(...a),
};
