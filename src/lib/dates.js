// Small date helpers. Dates are passed around as local "YYYY-MM-DD" strings.

export function toISO(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

export function daysBetween(fromISO, toISOStr) {
  return Math.round((new Date(`${toISOStr}T12:00`) - new Date(`${fromISO}T12:00`)) / 86400000);
}

// Days from today until a date: positive = future, negative = past.
export function daysUntil(iso) {
  return daysBetween(todayISO(), iso);
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export function fmtMonth(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Monday of the week containing the given date.
export function weekStart(iso) {
  const date = new Date(`${iso}T12:00`);
  const day = (date.getDay() + 6) % 7;
  return addDays(iso, -day);
}

export function countdownLabel(iso, noun = 'due') {
  const days = daysUntil(iso);
  if (days === 0) return `${noun} today`;
  if (days === 1) return `${noun} tomorrow`;
  if (days > 1) return `${noun} in ${days} days`;
  if (days === -1) return `1 day overdue`;
  return `${-days} days overdue`;
}

// Urgency class for countdown chips.
export function urgency(iso) {
  const days = daysUntil(iso);
  if (days < 0) return 'over';
  if (days <= 3) return 'hot';
  if (days <= 7) return 'warm';
  return 'cool';
}
