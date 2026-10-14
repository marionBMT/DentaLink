// The clinic operates in Manila time; the React date pickers use the same zone.
function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

// True for real calendar dates in YYYY-MM-DD form (rejects 2026-02-31 etc.)
function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// YYYY-MM-DD strings compare correctly with plain string comparison
function isTodayOrFuture(value) {
  return value >= manilaToday();
}

module.exports = { manilaToday, isValidCalendarDate, isTodayOrFuture };
