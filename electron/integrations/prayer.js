// Sunni prayer times via the AlAdhan API for three fixed cities.
// Jeddah uses Umm Al-Qura (what Saudi mosques follow); Manchester and
// London use the Muslim World League method (standard UK Sunni).
// Days are cached so the section still works offline.
const store = require('./../store');

const CITIES = {
  jeddah: { city: 'Jeddah', country: 'SA', method: 4, tz: 'Asia/Riyadh', label: 'Jeddah', labelAr: 'جدة' },
  manchester: { city: 'Manchester', country: 'GB', method: 3, tz: 'Europe/London', label: 'Manchester', labelAr: 'مانشستر' },
  london: { city: 'London', country: 'GB', method: 3, tz: 'Europe/London', label: 'London', labelAr: 'لندن' },
};

// Today's times + tomorrow's Fajr (needed for the Isha countdown).
async function fetchDay(cityKey) {
  const cfg = CITIES[cityKey] || CITIES.manchester;
  const today = dateInTz(cfg.tz);
  const day = await getTimings(cfg, today);

  let tomorrowFajr = null;
  try {
    tomorrowFajr = (await getTimings(cfg, dateInTz(cfg.tz, 1))).timings.Fajr;
  } catch {
    // countdown falls back to today's Fajr time
  }

  pruneCache(today);
  return { cityKey, label: cfg.label, labelAr: cfg.labelAr, tz: cfg.tz, ...day, tomorrowFajr };
}

async function getTimings(cfg, isoDate) {
  const cache = store.load('prayer-cache', {});
  const key = `${cfg.city}:${isoDate}`;
  // Older cache entries predate the night times — refetch those.
  if (cache[key]?.timings?.Lastthird) return cache[key];

  const [y, m, d] = isoDate.split('-');
  const url = `https://api.aladhan.com/v1/timingsByCity/${d}-${m}-${y}?city=${cfg.city}&country=${cfg.country}&method=${cfg.method}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Prayer times API responded ${res.status}`);
  const data = (await res.json()).data;

  const entry = {
    date: isoDate,
    timings: Object.fromEntries(
      ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Midnight', 'Lastthird'].map((k) => [
        k,
        (data.timings[k] || '').slice(0, 5),
      ])
    ),
    hijri: {
      en: `${data.date.hijri.day} ${data.date.hijri.month.en} ${data.date.hijri.year} AH`,
      ar: `${arabicDigits(data.date.hijri.day)} ${data.date.hijri.month.ar} ${arabicDigits(data.date.hijri.year)}`,
      weekdayAr: data.date.hijri.weekday.ar,
    },
  };
  cache[key] = entry;
  store.save('prayer-cache', cache);
  return entry;
}

// Keep the cache small: only yesterday onwards is ever needed.
function pruneCache(todayISO) {
  const cache = store.load('prayer-cache', {});
  let changed = false;
  for (const key of Object.keys(cache)) {
    const date = key.split(':')[1];
    if (date < addDaysISO(todayISO, -1)) {
      delete cache[key];
      changed = true;
    }
  }
  if (changed) store.save('prayer-cache', cache);
}

function dateInTz(tz, offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date); // YYYY-MM-DD
}

function addDaysISO(iso, n) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function arabicDigits(text) {
  return String(text).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

module.exports = { fetchDay, CITIES };
