// ONE place for paths, port and limits. The server never calls Electron itself;
// electron/main.js passes in the two folders it decides.
const path = require('path');

// Business rules (Philippines has no daylight saving, so a fixed UTC+8 offset is correct).
// Timestamps stay UTC in the database; these only decide the business day and the AM/PM shift.
const BUSINESS = {
  utcOffsetMinutes: 8 * 60,
  dayStartHour: 5,   // the business day rolls over at 5:00 AM (open 10 AM - 11 PM)
  summaryWindowDays: 10, // the local system keeps daily summaries for the last 10 business days; HQ keeps them all
  pmStartHour: 17,   // AM shift 10:00-17:00, PM shift 17:00 until closing
};

function makeConfig({ dataDir, clientDir }) {
  return {
    dataDir,                                   // Electron userData (database, backups, logs)
    clientDir,                                 // built React app
    backupDir: path.join(dataDir, 'backups'),
    keepBackups: Number(process.env.GATS_KEEP_BACKUPS) || 10,
    host: '0.0.0.0',                           // phones must reach it
    port: Number(process.env.GATS_PORT) || 3000,
  };
}

module.exports = { makeConfig, BUSINESS };
