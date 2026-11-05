// Money is stored as integer centavos. Format it in this one place.
export const php = (cents) =>
  'PHP ' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Times are stored as UTC ISO strings. Convert to local time only for display.
export const timeLocal = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
export const dateTimeLocal = (iso) => (iso ? new Date(iso).toLocaleString('en-PH') : '');
