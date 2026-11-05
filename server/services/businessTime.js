const { BUSINESS } = require('../config');

// 'YYYY-MM-DD' of the BUSINESS day. Orders at 12:30 AM still belong to the day that started the evening before;
// the new day starts at 5:00 AM local time.
function businessDate(now = new Date()) {
  const shifted = new Date(now.getTime() + (BUSINESS.utcOffsetMinutes - BUSINESS.dayStartHour * 60) * 60000);
  return shifted.toISOString().slice(0, 10);
}

// 'AM' (before 5:00 PM) or 'PM' (5:00 PM until the day rolls over at 5:00 AM). Used by voids in Phase 6.
function shiftOf(now = new Date()) {
  const hour = new Date(now.getTime() + BUSINESS.utcOffsetMinutes * 60000).getUTCHours();
  return hour >= BUSINESS.pmStartHour || hour < BUSINESS.dayStartHour ? 'PM' : 'AM';
}

module.exports = { businessDate, shiftOf };
