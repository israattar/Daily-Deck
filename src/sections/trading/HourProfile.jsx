// Entry-time profile — what time of day trades get opened, and how they turn
// out. Bars diverge from a centre baseline: wins above, losses below, so a
// bad hour is visible as weight hanging below the line. Everything is bucketed
// by ENTRY time (the trade's `o` stamp), never close time.
//
// The MT4 reporter writes `o`/`c` as UTC epoch seconds, so hours are converted
// to this laptop's local time — the clock she actually trades against. Session
// bands are derived from each market's own opening hours, so they follow that
// market's daylight saving rather than being hardcoded.
import React, { useMemo, useState } from 'react';
import { Empty, Stat } from '../../components/ui';

// Market sessions in their own local trading hours.
const SESSIONS = [
  { id: 'asia', label: 'Asia', tz: 'Asia/Tokyo', open: 9, close: 18, color: 'var(--amber)' },
  { id: 'london', label: 'London', tz: 'Europe/London', open: 8, close: 17, color: 'var(--accent-2)' },
  { id: 'ny', label: 'New York', tz: 'America/New_York', open: 8, close: 17, color: 'var(--pink)' },
];

// Chart geometry (viewBox units).
const W = 960;
const H = 332;
const L = 52;
const R = 944;
const TOP = 14;
const ARM = 104; // height of each half
const BASE = TOP + ARM;
const AXIS = BASE + ARM;
const SLOT = (R - L) / 24;
const BAR = Math.min(24, SLOT - 10);
const ROW_H = 18;
const ROW_GAP = 5;
const ROWS_Y = 256;

export default function HourProfile({ trades }) {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState(null);

  const { hours, span } = useMemo(() => bucketByEntryHour(trades), [trades]);
  const sessions = useMemo(() => sessionSpans(new Date()), []);

  const total = hours.reduce((sum, h) => sum + h.n, 0);
  const peak = Math.max(1, ...hours.map((h) => Math.max(h.won, h.lost)));
  const top = niceMax(peak);
  const scale = (amount) => (amount / top) * ARM;

  const traded = hours.filter((h) => h.n > 0);
  const best = traded.length ? traded.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
  const worst = traded.length ? traded.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;
  const bleeding = traded.length ? traded.reduce((a, b) => (b.lost > a.lost ? b : a)) : null;

  if (total === 0) {
    return (
      <div className="card">
        <h3>Entry time — wins vs losses by hour</h3>
        <Empty icon="🕐">
          No per-trade entry times yet. These come from the Daily Deck reporter running in
          MT4 — day totals imported from a statement or Myfxbook don't include them.
        </Empty>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="panel-head">
        <div>
          <h3 style={{ marginBottom: 2 }}>Entry time — money won vs lost by hour</h3>
          <p className="faint" style={{ fontSize: 12 }}>
            All {total} trades ever recorded, bucketed by when they were <b>opened</b>
            {span && <> · {span}</>} · {tzLabel()}
          </p>
        </div>
        <div className="panel-actions">
          <button className="btn small" onClick={() => setAsTable(!asTable)}>
            {asTable ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>

      <div className="grid cols-3 mb">
        <Stat
          label="Best hour"
          value={best ? hourLabel(best.hour) : '—'}
          hint={best ? `${gbp(best.pnl)} net · ${gbp(best.won)} won, ${gbp(-best.lost)} lost` : ''}
        />
        <Stat
          label="Worst hour"
          value={worst ? hourLabel(worst.hour) : '—'}
          hint={worst ? `${gbp(worst.pnl)} net · ${gbp(worst.won)} won, ${gbp(-worst.lost)} lost` : ''}
        />
        <Stat
          label="Biggest loss hour"
          value={bleeding ? hourLabel(bleeding.hour) : '—'}
          hint={bleeding ? `${gbp(-bleeding.lost)} lost across ${bleeding.losses} losing trades` : ''}
        />
      </div>

      <div className="legend-row">
        <span className="key"><i className="swatch" style={{ background: 'var(--green)' }} />Won</span>
        <span className="key"><i className="swatch" style={{ background: 'var(--red)' }} />Lost</span>
        <span className="key-sep" />
        {sessions.map((s) => (
          <span key={s.id} className="key">
            <i className="swatch" style={{ background: s.color }} />
            {s.label} <span className="faint">{hourLabel(s.from)}–{hourLabel(s.to)}</span>
          </span>
        ))}
      </div>

      {asTable ? (
        <HourTable hours={hours} sessions={sessions} />
      ) : (
        <div className="hour-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="hour-chart" role="img"
            aria-label="Wins and losses by hour the trade was opened">
            {/* gridlines — hairline, solid, recessive */}
            {[0.5, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={R} y1={BASE - ARM * f} y2={BASE - ARM * f} className="grid" />
                <line x1={L} x2={R} y1={BASE + ARM * f} y2={BASE + ARM * f} className="grid" />
                <text x={L - 10} y={BASE - ARM * f + 4} className="tick" textAnchor="end">
                  {axisMoney(top * f)}
                </text>
                <text x={L - 10} y={BASE + ARM * f + 4} className="tick" textAnchor="end">
                  {axisMoney(top * f)}
                </text>
              </g>
            ))}
            <text x={L - 10} y={BASE + 4} className="tick" textAnchor="end">£0</text>

            {/* bars */}
            {hours.map((h) => {
              const cx = L + h.hour * SLOT + SLOT / 2;
              const x = cx - BAR / 2;
              const wh = scale(h.won);
              const lh = scale(h.lost);
              const lit = hover === h.hour;
              return (
                <g key={h.hour} opacity={hover == null || lit ? 1 : 0.45}>
                  {h.won > 0 && (
                    <path d={barPath(x, BASE - wh, BAR, wh, 4, true)} fill="var(--green)" />
                  )}
                  {h.lost > 0 && (
                    <path d={barPath(x, BASE, BAR, lh, 4, false)} fill="var(--red)" />
                  )}
                </g>
              );
            })}

            {/* baseline + axis */}
            <line x1={L} x2={R} y1={BASE} y2={BASE} className="axis" />

            {/* hour ticks — label every 3rd to keep the axis quiet */}
            {hours.map((h) =>
              h.hour % 3 === 0 ? (
                <text key={h.hour} x={L + h.hour * SLOT + SLOT / 2} y={AXIS + 18}
                  className="tick" textAnchor="middle">
                  {hourLabel(h.hour)}
                </text>
              ) : null
            )}

            {/* session bands under the axis, one row each so overlaps stay readable */}
            {sessions.map((s, i) => {
              const y = ROWS_Y + i * (ROW_H + ROW_GAP);
              return (
                <g key={s.id}>
                  {s.segs.map(([a, b], j) => {
                    const x = L + a * SLOT;
                    const w = (b - a) * SLOT;
                    return (
                      <g key={j}>
                        <rect x={x} y={y} width={w} height={ROW_H} rx="4"
                          fill={s.color} opacity="0.22" />
                        <rect x={x} y={y} width="3" height={ROW_H} rx="1.5" fill={s.color} />
                        {w > 62 && (
                          <text x={x + 10} y={y + 13} className="band-label">{s.label}</text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* hit targets — full slot width, far bigger than the bars */}
            {hours.map((h) => (
              <rect key={h.hour} x={L + h.hour * SLOT} y={TOP} width={SLOT} height={AXIS - TOP}
                fill="transparent" tabIndex={0} className="hit"
                onMouseEnter={() => setHover(h.hour)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(h.hour)}
                onBlur={() => setHover(null)}
              />
            ))}
          </svg>

          {hover != null && (
            <Tip hour={hours[hover]} sessions={sessions} />
          )}
        </div>
      )}
    </div>
  );
}

function Tip({ hour, sessions }) {
  const inSessions = sessions.filter((s) => s.segs.some(([a, b]) => hour.hour >= a && hour.hour < b));
  // Keep the card inside the plot: flip to the left half past the midpoint.
  const left = ((hour.hour + 0.5) / 24) * 100;
  return (
    <div className={`chart-tip ${left > 55 ? 'flip' : ''}`} style={{ left: `${left}%` }}>
      <div className="tip-head">{hourLabel(hour.hour)}–{hourLabel((hour.hour + 1) % 24)}</div>
      {hour.n === 0 ? (
        <div className="tip-row faint">No trades opened</div>
      ) : (
        <>
          <div className="tip-row">
            <b>{gbp(hour.won)}</b> <i className="line-key" style={{ background: 'var(--green)' }} />
            won <span className="faint">({hour.wins})</span>
          </div>
          <div className="tip-row">
            <b>{gbp(-hour.lost)}</b> <i className="line-key" style={{ background: 'var(--red)' }} />
            lost <span className="faint">({hour.losses})</span>
          </div>
          <div className="tip-row">
            <b style={{ color: hour.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{gbp(hour.pnl)}</b> net
          </div>
          <div className="tip-row faint">{winRate(hour)} win rate · {hour.n} trades</div>
        </>
      )}
      {inSessions.length > 0 && (
        <div className="tip-row faint">{inSessions.map((s) => s.label).join(' + ')}</div>
      )}
    </div>
  );
}

// The WCAG-clean twin of the chart — every value reachable without hovering.
function HourTable({ hours, sessions }) {
  const rows = hours.filter((h) => h.n > 0);
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Hour</th><th>Sessions</th><th>Trades</th><th>Won</th>
          <th>Lost</th><th>Wins</th><th>Losses</th><th>Win rate</th><th>Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.hour}>
            <td>{hourLabel(h.hour)}–{hourLabel((h.hour + 1) % 24)}</td>
            <td className="faint">
              {sessions.filter((s) => s.segs.some(([a, b]) => h.hour >= a && h.hour < b))
                .map((s) => s.label).join(', ') || '—'}
            </td>
            <td>{h.n}</td>
            <td style={{ color: 'var(--green)' }}>{gbp(h.won)}</td>
            <td style={{ color: 'var(--red)' }}>{gbp(-h.lost)}</td>
            <td>{h.wins}</td>
            <td>{h.losses}</td>
            <td>{winRate(h)}</td>
            <td style={{ color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{gbp(h.pnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- data ----

// Walk every stored trade — the whole history, never a rolling window — and
// bucket it by the local hour it was OPENED. Trades live under their close-date
// key, so one opened late at night and closed the next morning still lands in
// the hour it was actually entered.
function bucketByEntryHour(trades) {
  // won / lost are the money made and lost in that hour (lost is positive
  // magnitude, so it can be drawn downward); pnl is their difference.
  const hours = Array.from({ length: 24 }, (_, hour) => (
    { hour, n: 0, wins: 0, losses: 0, won: 0, lost: 0, pnl: 0 }
  ));
  let first = null;
  let last = null;

  for (const list of Object.values(trades || {})) {
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      const ms = Number(t.o) * 1000;
      if (!Number.isFinite(ms) || ms <= 0) continue;
      if (first === null || ms < first) first = ms;
      if (last === null || ms > last) last = ms;
      const bucket = hours[new Date(ms).getHours()];
      const p = Number(t.p) || 0;
      bucket.n++;
      bucket.pnl += p;
      if (p > 0) { bucket.wins++; bucket.won += p; }
      else if (p < 0) { bucket.losses++; bucket.lost += -p; }
    }
  }
  return { hours, span: first ? `${shortDate(first)} – ${shortDate(last)}` : null };
}

function shortDate(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A timezone's offset from UTC, in hours, at a given moment.
function tzOffset(timeZone, date) {
  const at = new Date(Math.floor(date.getTime() / 60000) * 60000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at);
  const p = {};
  for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return (asUtc - at.getTime()) / 3600000;
}

// Each market's opening hours expressed in this laptop's local hours. Sessions
// that straddle midnight come back as two segments so they draw correctly.
function sessionSpans(now) {
  const local = -now.getTimezoneOffset() / 60;
  return SESSIONS.map((s) => {
    const shift = local - tzOffset(s.tz, now);
    const from = wrap24(s.open + shift);
    const to = wrap24(s.close + shift);
    return { ...s, from, to, segs: to > from ? [[from, to]] : [[from, 24], [0, to]] };
  });
}

const wrap24 = (h) => ((h % 24) + 24) % 24;

// ---- drawing ----

// A bar with its outer end rounded and the baseline end square.
function barPath(x, y, w, h, r, up) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  if (up) {
    return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} `
      + `L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
  }
  return `M${x} ${y} L${x} ${y + h - rr} Q${x} ${y + h} ${x + rr} ${y + h} `
    + `L${x + w - rr} ${y + h} Q${x + w} ${y + h} ${x + w} ${y + h - rr} L${x + w} ${y} Z`;
}

function niceMax(v) {
  if (v <= 5) return Math.max(1, v);
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

// ---- formatting ----

// Axis ticks stay short so they never crowd the plot: £250, £1.5k.
function axisMoney(n) {
  if (n >= 1000) {
    const k = n / 1000;
    return `£${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `£${Math.round(n)}`;
}

function hourLabel(h) {
  const n = Math.round(h) % 24;
  if (n === 0) return '12am';
  if (n === 12) return '12pm';
  return n < 12 ? `${n}am` : `${n - 12}pm`;
}

function winRate(h) {
  const decided = h.wins + h.losses;
  return decided ? `${Math.round((h.wins / decided) * 100)}%` : '—';
}

function tzLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  } catch {
    return 'local time';
  }
}

function gbp(n) {
  const decimals = Math.abs(n) % 1 ? 2 : 0;
  return `${n < 0 ? '-' : ''}£${Math.abs(n).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
