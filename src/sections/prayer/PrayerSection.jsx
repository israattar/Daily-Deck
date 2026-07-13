// Prayer — today's Sunni prayer times for a chosen city (Jeddah, Manchester
// or London): a live countdown ring for the current prayer, an iconed
// timeline of the day, the Hijri date, qibla direction, night worship
// times, and a carousel of favourite ayahs in Quranic calligraphy.
import React, { useEffect, useMemo, useState } from 'react';
import { deck, useStore } from '../../api';
import { SectionHead, Empty } from '../../components/ui';

const KAABA = { lat: 21.4225, lng: 39.8262 };

const CITIES = [
  { key: 'manchester', label: 'Manchester', labelAr: 'مانشستر', city: 'Manchester', tz: 'Europe/London', lat: 53.4808, lng: -2.2426, method: 'Muslim World League' },
  { key: 'london', label: 'London', labelAr: 'لندن', city: 'London', tz: 'Europe/London', lat: 51.5074, lng: -0.1278, method: 'Muslim World League' },
  { key: 'jeddah', label: 'Jeddah', labelAr: 'جدة', city: 'Jeddah', tz: 'Asia/Riyadh', lat: 21.5433, lng: 39.1728, method: 'Umm Al-Qura' },
];

const PRAYERS = [
  { key: 'Fajr', ar: 'الفجر' },
  { key: 'Sunrise', ar: 'الشروق', info: true }, // not a prayer — marks when Fajr ends
  { key: 'Dhuhr', ar: 'الظهر' },
  { key: 'Asr', ar: 'العصر' },
  { key: 'Maghrib', ar: 'المغرب' },
  { key: 'Isha', ar: 'العشاء' },
];

const AYAHS = [
  { ar: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', en: 'Indeed, with hardship comes ease.', ref: 'Ash-Sharh 94:6' },
  { ar: 'وَلَلْآخِرَةُ خَيْرٌ لَّكَ مِنَ الْأُولَىٰ', en: 'And the Hereafter is better for you than the first life.', ref: 'Ad-Duhaa 93:4' },
  { ar: 'فَإِنَّهَا لَا تَعْمَى الْأَبْصَارُ وَلَكِنْ تَعْمَى الْقُلُوبُ الَّتِي فِي الصُّدُورِ', en: 'Indeed, it is not the eyes that are blinded, but it is the hearts within the chests that grow blind.', ref: 'Al-Hajj 22:46' },
  { ar: 'وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ', en: 'And He is with you wherever you are.', ref: 'Al-Hadid 57:4' },
  { ar: 'فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ', en: 'So which of the favours of your Lord will you both deny?', ref: 'Ar-Rahman 55:13' },
  { ar: 'وَوَجَدَكَ ضَالًّا فَهَدَىٰ', en: 'And He found you lost and guided you.', ref: 'Ad-Duhaa 93:7' },
];

export default function PrayerSection() {
  const [prefs, setPrefs] = useStore('prayer', { city: 'manchester' });
  const [day, setDay] = useState(null);
  const [error, setError] = useState('');

  const cityKey = prefs?.city || 'manchester';
  const cityCfg = CITIES.find((c) => c.key === cityKey) || CITIES[0];

  // Load today's times: ask the main process (which caches), and fall back
  // to the cache store directly so the UI still works offline.
  useEffect(() => {
    let alive = true;
    setDay(null);
    setError('');
    (async () => {
      try {
        const fresh = await deck.invoke('prayer:fetch', { city: cityKey });
        if (alive) setDay(fresh);
      } catch (err) {
        const cache = (await deck.load('prayer-cache', {})) || {};
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: cityCfg.tz }).format(new Date());
        const cached = cache[`${cityCfg.city}:${today}`];
        if (alive) {
          if (cached) setDay({ ...cached, tz: cityCfg.tz, label: cityCfg.label, labelAr: cityCfg.labelAr, tomorrowFajr: null });
          else setError(err.message || 'Could not load prayer times');
        }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey]);

  return (
    <div>
      <SectionHead
        title="Prayer"
        sub={day ? `${day.hijri.en} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Loading times…'}
      >
        <span className="faint">📍</span>
        <select value={cityKey} onChange={(e) => setPrefs({ ...prefs, city: e.target.value })}>
          {CITIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label} · {c.labelAr}</option>
          ))}
        </select>
      </SectionHead>

      <AyahCarousel />

      {error && !day && (
        <div className="card mb"><Empty icon="🕌">{error}</Empty></div>
      )}

      {day && <PrayerDashboard day={day} cityCfg={cityCfg} />}
    </div>
  );
}

/* ------------------------------------------------------------ carousel */

function AyahCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % AYAHS.length), 9000);
    return () => clearInterval(timer);
  }, []);

  const ayah = AYAHS[index];
  const move = (delta) => setIndex((i) => (i + delta + AYAHS.length) % AYAHS.length);

  return (
    <div className="ayah-wrap mb">
      <button className="ayah-arrow" onClick={() => move(-1)}>‹</button>
      <div className="card ayah-card">
        <div className="ayah-ar">{ayah.ar}</div>
        <div className="ayah-en">{ayah.en}</div>
        <div className="ayah-ref">{ayah.ref}</div>
        <div className="dots">
          {AYAHS.map((_, i) => (
            <button key={i} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} />
          ))}
        </div>
      </div>
      <button className="ayah-arrow" onClick={() => move(1)}>›</button>
    </div>
  );
}

/* ----------------------------------------------------------- dashboard */

function PrayerDashboard({ day, cityCfg }) {
  const [, forceTick] = useState(0);

  // Re-render every second for the live countdown.
  useEffect(() => {
    const timer = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const times = useMemo(
    () => PRAYERS.map((p) => ({ ...p, time: day.timings[p.key], sec: toSeconds(day.timings[p.key]) })),
    [day]
  );

  const now = nowSecondsInTz(day.tz);
  const status = currentPrayer(times, now, day.tomorrowFajr);
  const qibla = qiblaBearing(cityCfg);

  return (
    <>
      <div className="prayer-grid mb">
        {/* Hero: countdown ring for the current prayer */}
        <div className="card prayer-hero">
          <div className="which">{status.heading}</div>
          <CountdownRing progress={status.progress} label={formatRemaining(status.remaining)}>
            <div className="ring-name">{status.name}</div>
            <div className="ring-name-ar ar">{status.nameAr}</div>
          </CountdownRing>
          <p className="muted">{status.detail}</p>
          <p className="next-line">
            {status.nextName && (
              <>then <b>{status.nextName}</b> at <b>{status.nextTime}</b></>
            )}
          </p>
        </div>

        {/* Side column */}
        <div className="prayer-side">
          <div className="card hijri-card">
            <div className="hijri-ar ar">{day.hijri.weekdayAr}</div>
            <div className="hijri-date ar">{day.hijri.ar}</div>
            <div className="muted">{day.hijri.en}</div>
          </div>
          <div className="card fact-card">
            <div className="fact">
              <span className="fact-icon">🕋</span>
              <div>
                <div className="fact-label">Qibla from {day.label}</div>
                <div className="fact-value">{qibla.deg}° {qibla.compass}</div>
              </div>
            </div>
            <hr className="divider" />
            <div className="fact">
              <span className="fact-icon">🌙</span>
              <div>
                <div className="fact-label">Islamic midnight</div>
                <div className="fact-value">{day.timings.Midnight || '—'}</div>
              </div>
            </div>
            <div className="fact">
              <span className="fact-icon">✨</span>
              <div>
                <div className="fact-label">Last third of the night (tahajjud)</div>
                <div className="fact-value">{day.timings.Lastthird || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline of the day's prayers */}
      <div className="prayer-times">
        {times.map((p) => {
          const state =
            p.key === status.currentKey ? 'current'
            : p.sec < now ? 'done'
            : 'upcoming';
          return (
            <div key={p.key} className={`prayer-cell ${state} ${p.info ? 'info' : ''}`}>
              <PrayerIcon name={p.key} />
              <div className="p-en">{p.key}</div>
              <div className="p-ar ar">{p.ar}</div>
              <div className="p-time">{p.time}</div>
              {state === 'done' && !p.info && <span className="p-tick">✓</span>}
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ marginTop: 10 }}>
        Sunni times · {day.label} ({day.labelAr}) · {cityCfg.method} method
      </p>
    </>
  );
}

/* --------------------------------------------------------------- ring */

function CountdownRing({ progress, label, children }) {
  const R = 92;
  const C = 2 * Math.PI * R;
  const filled = Math.min(1, Math.max(0, progress || 0));

  return (
    <div className="ring-wrap">
      <svg width="230" height="230" viewBox="0 0 230 230">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b7cf7" />
            <stop offset="100%" stopColor="#5b8cff" />
          </linearGradient>
        </defs>
        <circle cx="115" cy="115" r={R} fill="none" stroke="var(--bg-2)" strokeWidth="10" />
        <circle
          cx="115" cy="115" r={R}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - filled)}
          transform="rotate(-90 115 115)"
        />
      </svg>
      <div className="ring-inner">
        {children}
        <div className="ring-count">{label}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- prayer icons */

function PrayerIcon({ name }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    Fajr: ( // first light on the horizon
      <g {...stroke}>
        <path d="M3 17.5h18" />
        <path d="M8 17.5a4 4 0 0 1 8 0" />
        <path d="M12 8.5v-2M6 11l-1.4-1.4M18 11l1.4-1.4" />
      </g>
    ),
    Sunrise: (
      <g {...stroke}>
        <path d="M3 17.5h18" />
        <path d="M8 17.5a4 4 0 0 1 8 0" />
        <path d="M12 10V4.5M9.8 6.7 12 4.5l2.2 2.2" />
      </g>
    ),
    Dhuhr: ( // sun at its highest
      <g {...stroke}>
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 4.2v1.6M12 18.2v1.6M4.2 12h1.6M18.2 12h1.6M6.5 6.5l1.1 1.1M16.4 16.4l1.1 1.1M17.5 6.5l-1.1 1.1M7.6 16.4l-1.1 1.1" />
      </g>
    ),
    Asr: ( // sun leaning into the afternoon
      <g {...stroke}>
        <circle cx="14" cy="10" r="3.2" />
        <path d="M14 3.5v1.4M20.5 10h-1.4M18.6 5.4l-1 1M5 20.5l4.5-4.5M3.5 15.5h3M8.5 20.5v-3" />
      </g>
    ),
    Maghrib: ( // sun slipping below the horizon
      <g {...stroke}>
        <path d="M3 15.5h18" />
        <path d="M8 15.5a4 4 0 0 1 8 0" />
        <path d="M12 19v2.5M14.2 20.3 12 22.5l-2.2-2.2" transform="translate(0 -1.5)" />
      </g>
    ),
    Isha: ( // crescent and star
      <g {...stroke}>
        <path d="M18.5 13.2A7 7 0 0 1 10.8 5.5a7 7 0 1 0 7.7 7.7z" />
        <path d="M17 4.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
      </g>
    ),
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" className="p-icon">{icons[name]}</svg>;
}

/* --------------------------------------------------------------- maths */

// Which prayer window are we in, and how long until it ends?
// Fajr runs until Sunrise; each prayer then runs until the next one;
// Isha runs until tomorrow's Fajr. Between Sunrise and Dhuhr there is no
// current prayer, so we count down to Dhuhr instead.
function currentPrayer(times, now, tomorrowFajr) {
  const [fajr, sunrise, dhuhr] = times;
  const isha = times[times.length - 1];

  let last = null;
  for (const p of times) if (now >= p.sec) last = p;

  const build = (currentKey, heading, name, nameAr, start, end, detail, next) => ({
    currentKey, heading, name, nameAr,
    remaining: wrap(end - now),
    progress: (wrap(now - start)) / Math.max(1, wrap(end - start)),
    detail,
    nextName: next?.key || null,
    nextTime: next?.time || null,
  });

  if (last === null) {
    // after midnight, before Fajr — Isha continues until today's Fajr
    return build('Isha', 'Current prayer', 'Isha', isha.ar, isha.sec - 86400, fajr.sec, `until Fajr at ${fajr.time}`, fajr);
  }
  if (last.key === 'Isha') {
    const end = toSeconds(tomorrowFajr || fajr.time) + 86400;
    return build('Isha', 'Current prayer', 'Isha', isha.ar, isha.sec, end, `until Fajr at ${tomorrowFajr || fajr.time}`, null);
  }
  if (last.key === 'Sunrise') {
    return build(null, 'Next prayer', 'Dhuhr', dhuhr.ar, sunrise.sec, dhuhr.sec, `begins at ${dhuhr.time}`, null);
  }
  const index = times.indexOf(last);
  const next = times[index + 1];
  const after = next.info ? times[index + 2] : next;
  return build(
    last.key, 'Current prayer', last.key, last.ar, last.sec, next.sec,
    `until ${next.info ? `sunrise at ${next.time}` : `${next.key} at ${next.time}`}`,
    after
  );
}

// Great-circle bearing from the city to the Kaaba.
function qiblaBearing(cityCfg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const p1 = toRad(cityCfg.lat);
  const p2 = toRad(KAABA.lat);
  const dl = toRad(KAABA.lng - cityCfg.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const deg = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
  return { deg, compass };
}

function wrap(seconds) {
  return seconds < 0 ? seconds + 86400 : seconds;
}

function toSeconds(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return h * 3600 + m * 60;
}

function nowSecondsInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
}

// Always hours : minutes : seconds, e.g. "2:14:09".
function formatRemaining(total) {
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
