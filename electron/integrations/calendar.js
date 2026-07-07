// Fetches iCloud (or any) calendars via their ICS subscription URLs and
// returns plain event objects for a date range, with repeating events
// expanded into individual occurrences.
const ical = require('node-ical');

async function fetchEvents(calendars = [], fromISO, toISO) {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  const results = await Promise.all(
    calendars
      .filter((cal) => cal.url?.trim())
      .map(async (cal) => {
        try {
          return { name: cal.name, ok: true, events: await fetchOne(cal, from, to) };
        } catch (err) {
          return { name: cal.name, ok: false, error: err.message, events: [] };
        }
      })
  );

  return {
    events: results.flatMap((r) => r.events).sort((a, b) => a.start.localeCompare(b.start)),
    sourceStatus: results.map(({ events, ...status }) => ({ ...status, count: events.length })),
  };
}

async function fetchOne(cal, from, to) {
  const url = cal.url.trim().replace(/^webcal:/, 'https:');
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Calendar responded ${res.status}`);
  const parsed = ical.sync.parseICS(await res.text());

  const events = [];
  for (const item of Object.values(parsed)) {
    if (item.type !== 'VEVENT') continue;
    const durationMs = (item.end || item.start) - item.start;

    if (item.rrule) {
      // Repeating event: expand occurrences, minus deleted/moved ones.
      const excluded = new Set(
        Object.keys(item.exdate || {}).map((k) => new Date(item.exdate[k]).toDateString())
      );
      for (const date of item.rrule.between(from, to, true)) {
        if (excluded.has(date.toDateString())) continue;
        const override = item.recurrences?.[date.toISOString().slice(0, 10)];
        const occurrence = override || item;
        const start = override ? override.start : date;
        events.push(toEvent(occurrence, cal, start, durationMs));
      }
    } else if (item.start >= from && item.start <= to) {
      events.push(toEvent(item, cal, item.start, durationMs));
    }
  }
  return events;
}

function toEvent(item, cal, start, durationMs) {
  const startDate = new Date(start);
  return {
    id: `${cal.name}:${item.uid}:${startDate.toISOString()}`,
    title: item.summary || '(untitled)',
    start: startDate.toISOString(),
    end: new Date(startDate.getTime() + durationMs).toISOString(),
    date: localDateISO(startDate),
    allDay: item.datetype === 'date',
    location: item.location || '',
    calendar: cal.name,
    color: cal.color || '#7c6cf0',
  };
}

// Date in the laptop's timezone, not UTC — an 11pm event should not land on tomorrow.
function localDateISO(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

module.exports = { fetchEvents };
