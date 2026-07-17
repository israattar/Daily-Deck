// Claude — how the shared Claude account is being used.
// There's no public API for the plan-limit percentages, so the gauges are
// driven by readings Israa types in from Claude Code's /usage panel. Each
// reading also calibrates the hidden caps against her measured cost, which
// unlocks live projections and the you-vs-others split. Below that: this
// PC's own usage from the local transcripts — minutes, tokens, models, value.
import React, { useEffect, useMemo, useState } from 'react';
import { deck, isDesktop } from '../../api';
import { SectionHead, Stat, Chip, Empty, Tabs } from '../../components/ui';

const TIMEFRAMES = ['Today', '7 days', '30 days', 'All time'];

export default function ClaudeSection() {
  const [usage, setUsage] = useState(null);
  const [snaps, setSnaps] = useState(null);
  const [error, setError] = useState('');
  const [frame, setFrame] = useState('7 days');
  const [draft, setDraft] = useState({ session: '', week: '', weekModel: '' });
  const [refreshing, setRefreshing] = useState(false);

  async function loadAll() {
    if (!isDesktop) return;
    try {
      const [u, s] = await Promise.all([deck.invoke('claude:usage'), deck.invoke('claude:snapshots')]);
      setUsage(u);
      setSnaps(s);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function logReading() {
    try {
      setSnaps(await deck.invoke('claude:log', draft));
      setDraft({ session: '', week: '', weekModel: '' });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  // Rescan transcripts every 5 minutes while the page is open so the
  // projections keep moving without her touching anything.
  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => usage && summarise(usage.days, frame), [usage, frame]);
  const chart = useMemo(() => usage && lastDays(usage.days, 14), [usage]);

  if (!isDesktop) {
    return (
      <div>
        <SectionHead title="Claude" />
        <div className="card"><Empty icon="🖥️">Available in the desktop app only.</Empty></div>
      </div>
    );
  }
  if (!usage || !snaps) return null;

  const { snapshots, caps } = snaps;
  const latestSession = latestWith(snapshots, 'session');
  const latestWeek = latestWith(snapshots, 'week');
  const latestWeekModel = latestWith(snapshots, 'weekModel');
  const hasReadings = snapshots.length > 0;

  // Live projections: logged % + (her cost since logging) / calibrated cap.
  // Only while the same limit window the reading was taken in is still open.
  const winStart = usage.currentWindow ? Date.parse(usage.currentWindow.start) : null;
  const sessionStale = latestSession && (winStart == null || latestSession.t < winStart);
  let sessionEst = null;
  if (latestSession && !sessionStale && caps.capSession) {
    const grown = Math.max(0, usage.currentWindow.cost - latestSession.sessCost);
    sessionEst = Math.min(100, latestSession.session + (grown / caps.capSession) * 100);
  }

  const weekStart = Date.parse(usage.week.since);
  const weekStale = latestWeek && latestWeek.t < weekStart;
  let weekEst = null;
  if (latestWeek && !weekStale && caps.capWeek) {
    const grown = Math.max(0, usage.week.cost - latestWeek.weekCost);
    weekEst = Math.min(100, latestWeek.week + (grown / caps.capWeek) * 100);
  }

  // You vs others: your measured week ÷ calibrated cap = your points of the
  // weekly limit; the rest of the account's total is everyone else.
  const weekShown = weekEst != null ? weekEst : latestWeek && !weekStale ? latestWeek.week : null;
  let split = null;
  if (weekShown != null && caps.capWeek) {
    const mine = Math.min(weekShown, (usage.week.cost / caps.capWeek) * 100);
    split = { mine, others: Math.max(0, weekShown - mine) };
  }

  const weekModelList = Object.entries(usage.week.models)
    .map(([model, use]) => ({ model, ...use }))
    .sort((a, b) => b.cost - a.cost);

  return (
    <div>
      <SectionHead
        title="Claude"
        sub={`your usage on this PC · updated ${timeAgo(usage.refreshedAt)}`}
      >
        <button className="btn primary" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </SectionHead>

      {error && (
        <div className="source-status mb"><Chip tone="red">{error}</Chip></div>
      )}

      {/* ---- Account limits, from her logged /usage readings ---- */}
      {hasReadings && (
        <div className="grid cols-3 mb">
          <LimitGauge
            label="Session (5h) — whole account"
            value={sessionEst != null ? sessionEst : latestSession && !sessionStale ? latestSession.session : null}
            hint={gaugeHint(latestSession, sessionEst != null, sessionStale, 'the 5h window reset since — log a fresh one')}
          />
          <LimitGauge
            label="Week, all models — whole account"
            value={weekShown}
            hint={gaugeHint(latestWeek, weekEst != null, weekStale, 'that was last week — log a fresh one')}
          />
          <LimitGauge
            label="Week, Fable/Opus — whole account"
            value={latestWeekModel && latestWeekModel.t >= weekStart ? latestWeekModel.weekModel : null}
            hint={gaugeHint(latestWeekModel, false, latestWeekModel && latestWeekModel.t < weekStart, 'that was last week — log a fresh one')}
          />
        </div>
      )}

      <div className="card mb">
        <h3>{hasReadings ? 'Log a fresh /usage reading' : 'Set up the account gauges'}</h3>
        <p className="note" style={{ marginTop: 0 }}>
          {hasReadings
            ? 'Type /usage in Claude Code, copy the percentages in — takes 20 seconds and re-calibrates everything.'
            : 'There’s no API for the account limits, so the gauges work off readings you log by hand: type /usage in Claude Code, copy the three percentages here. Each reading also calibrates the estimates that keep the gauges moving between readings.'}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            type="number" min="0" max="100" style={{ width: 150 }}
            placeholder="Session % used"
            value={draft.session}
            onChange={(e) => setDraft({ ...draft, session: e.target.value })}
          />
          <input
            type="number" min="0" max="100" style={{ width: 170 }}
            placeholder="Weekly, all models %"
            value={draft.week}
            onChange={(e) => setDraft({ ...draft, week: e.target.value })}
          />
          <input
            type="number" min="0" max="100" style={{ width: 170 }}
            placeholder="Weekly, Fable/Opus %"
            value={draft.weekModel}
            onChange={(e) => setDraft({ ...draft, weekModel: e.target.value })}
          />
          <button
            className="btn primary"
            onClick={logReading}
            disabled={draft.session === '' && draft.week === '' && draft.weekModel === ''}
          >
            Log reading
          </button>
        </div>
      </div>

      {/* ---- Who's using it + current window ---- */}
      <div className="grid cols-2 mb">
        <div className="card">
          <h3>Who's used the account this week</h3>
          {split ? (
            <div className="donut-card">
              <Donut a={split.mine} b={split.others} />
              <div className="legend">
                <div className="row">
                  <span className="dot" style={{ background: 'var(--accent)' }} />
                  You (this PC) — <b>{Math.round((split.mine / (split.mine + split.others || 1)) * 100)}%</b>
                </div>
                <div className="row">
                  <span className="dot" style={{ background: 'var(--pink)' }} />
                  Others — <b>{Math.round((split.others / (split.mine + split.others || 1)) * 100)}%</b>
                </div>
                <div className="note">
                  Rough split of the ~{Math.round(weekShown)}% of the weekly limit used so far.
                  Your slice is measured from this PC's transcripts; phone/web use counts as
                  “others”. Sharpens as you log more readings.
                </div>
              </div>
            </div>
          ) : (
            <Empty icon="👥">
              Log a weekly % while you've been the main user this week and the split appears —
              it needs one reading to calibrate against.
            </Empty>
          )}
        </div>

        <div className="card">
          <h3>Current 5-hour window (this PC)</h3>
          {usage.currentWindow ? (
            <div>
              <div className="stat" style={{ padding: 0 }}>
                <div className="value">
                  {clock(usage.currentWindow.start)} – {clock(usage.currentWindow.end)}
                </div>
                <div className="hint">
                  {usage.currentWindow.msgs} replies · {fmtMins(usage.currentWindow.minutes)} active
                  · {money(usage.currentWindow.cost)} API value · ends in {until(usage.currentWindow.end)}
                </div>
              </div>
              {sessionEst != null && (
                <div style={{ marginTop: 12 }}>
                  <div className="progress">
                    <div
                      className={`fill ${sessionEst >= 85 ? 'red' : ''}`}
                      style={{ width: `${Math.min(100, sessionEst)}%` }}
                    />
                  </div>
                  <div className="note">
                    Account session: ≈{Math.round(sessionEst)}% used (estimated from your last
                    reading + your usage since)
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Empty icon="😴">No Claude activity on this PC in the current 5-hour window.</Empty>
          )}
        </div>
      </div>

      {/* ---- Which model ate this week's limit (your usage, exact) ---- */}
      <div className="card mb">
        <h3>Your week by model — since {weekLabel(usage.week.since)}</h3>
        {weekModelList.length === 0 ? (
          <Empty icon="🤖">No usage on this PC since the weekly reset.</Empty>
        ) : (
          <div>
            {weekModelList.map((m) => (
              <div key={m.model} className="week-model-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 130, flexShrink: 0 }}><Chip tone="accent">{prettyModel(m.model)}</Chip></span>
                <div className="progress" style={{ flex: 1, height: 9 }}>
                  <div className="fill" style={{ width: `${usage.week.cost ? (m.cost / usage.week.cost) * 100 : 0}%` }} />
                </div>
                <span className="faint" style={{ width: 170, flexShrink: 0, textAlign: 'right' }}>
                  {Math.round(usage.week.cost ? (m.cost / usage.week.cost) * 100 : 0)}% · {money(m.cost)} · {fmtTokens(m.in + m.out + m.cacheRead + m.cache5m + m.cache1h)}
                </span>
              </div>
            ))}
            <p className="note" style={{ marginBottom: 0 }}>
              Cost-weighted share of your usage on this PC in the current weekly-limit window —
              this is what drains the weekly bars. Exact, from your transcripts.
            </p>
          </div>
        )}
      </div>

      {/* ---- Your analytics ---- */}
      <div className="mb">
        <Tabs tabs={TIMEFRAMES} active={frame} onChange={setFrame} />
      </div>

      <div className="grid cols-4 mb">
        <Stat label="Active time" value={fmtMins(stats.minutes)} hint={`across ${stats.sessions} session${stats.sessions === 1 ? '' : 's'}`} />
        <Stat label="Prompts sent" value={stats.userMsgs} hint={`${stats.msgs} model replies`} />
        <Stat label="Tokens" value={fmtTokens(stats.tokens)} hint={`${fmtTokens(stats.in)} in · ${fmtTokens(stats.out)} out · rest cache`} />
        <Stat label="Est. API value" value={money(stats.cost)} hint="what this would cost pay-as-you-go" />
      </div>

      <div className="card mb">
        <h3>Daily activity — last 14 days</h3>
        <div className="chart">
          {chart.map((d) => (
            <div
              key={d.date}
              className="bar"
              style={{ height: `${d.pct}%` }}
              data-tip={`${d.label}: ${fmtTokens(d.tokens)} tokens · ${fmtMins(d.minutes)} · ${money(d.cost)}`}
            />
          ))}
        </div>
        <div className="chart-labels">
          {chart.map((d) => <span key={d.date}>{d.short}</span>)}
        </div>
      </div>

      <div className="card">
        <h3>By model — {frame.toLowerCase()}</h3>
        {stats.models.length === 0 ? (
          <Empty icon="🤖">No usage in this period.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Model</th><th>Replies</th><th>Input</th><th>Output</th>
                <th>Cache read</th><th>Cache write</th><th>Est. value</th><th style={{ width: '18%' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {stats.models.map((m) => (
                <tr key={m.model}>
                  <td><Chip tone="accent">{prettyModel(m.model)}</Chip></td>
                  <td>{m.msgs}</td>
                  <td>{fmtTokens(m.in)}</td>
                  <td>{fmtTokens(m.out)}</td>
                  <td>{fmtTokens(m.cacheRead)}</td>
                  <td>{fmtTokens(m.cache5m + m.cache1h)}</td>
                  <td>{money(m.cost)}</td>
                  <td>
                    <div className="progress" style={{ height: 7 }}>
                      <div className="fill" style={{ width: `${stats.cost ? (m.cost / stats.cost) * 100 : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---- account-limit widgets ----

// Semicircular gauge: how much of one account window is used.
function LimitGauge({ label, value, hint }) {
  const used = value == null ? null : Math.min(100, Math.max(0, value));
  const color = used >= 85 ? 'var(--red)' : used >= 60 ? 'var(--amber)' : 'var(--green)';
  return (
    <div className="card stat gauge-card">
      <div>
        <div className="label">{label}</div>
        <div className="value">{used == null ? '—' : <>{Math.round(used)}%<small>used</small></>}</div>
        <div className="hint">{hint}</div>
      </div>
      <div className="gauge">
        <svg width="132" height="74" viewBox="0 0 132 74">
          <path d={semiArc(66, 66, 52, 0, 1)} stroke="var(--surface-3)" strokeWidth="11" fill="none" strokeLinecap="round" />
          {used > 0 && (
            <path d={semiArc(66, 66, 52, 0, Math.max(0.02, used / 100))} stroke={color} strokeWidth="11" fill="none" strokeLinecap="round" />
          )}
        </svg>
      </div>
    </div>
  );
}

function gaugeHint(snap, isEstimate, stale, staleText) {
  if (!snap) return 'not logged yet';
  if (stale) return `logged ${timeAgo(snap.t)} — ${staleText}`;
  return `${isEstimate ? 'estimate · ' : ''}logged ${timeAgo(snap.t)}`;
}

function Donut({ a, b }) {
  const total = a + b || 1;
  const r = 44;
  const c = 2 * Math.PI * r;
  const fracA = a / total;
  return (
    <svg width="116" height="116" viewBox="0 0 116 116" style={{ flexShrink: 0 }}>
      <circle cx="58" cy="58" r={r} fill="none" stroke="var(--pink)" strokeWidth="14" />
      <circle
        cx="58" cy="58" r={r} fill="none" stroke="var(--accent)" strokeWidth="14"
        strokeDasharray={`${fracA * c} ${c}`} strokeLinecap={fracA > 0 && fracA < 1 ? 'round' : 'butt'}
        transform="rotate(-90 58 58)"
      />
      <text x="58" y="63" textAnchor="middle" fill="var(--text)" fontSize="19" fontWeight="700">
        {Math.round(fracA * 100)}%
      </text>
    </svg>
  );
}

// Arc along the top semicircle: frac 0 = far left, 1 = far right.
function semiArc(cx, cy, r, fromFrac, toFrac) {
  const point = (f) => {
    const t = Math.PI * (1 - f);
    return `${cx + r * Math.cos(t)} ${cy - r * Math.sin(t)}`;
  };
  return `M ${point(fromFrac)} A ${r} ${r} 0 0 1 ${point(toFrac)}`;
}

// ---- number crunching ----

// Most recent reading that actually filled in the given field.
function latestWith(snapshots, key) {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i][key] != null) return snapshots[i];
  }
  return null;
}

function summarise(days, frame) {
  const start = frameStart(frame);
  const models = {};
  const sessions = new Set();
  let minutes = 0;
  let userMsgs = 0;
  for (const [date, day] of Object.entries(days)) {
    if (start && date < start) continue;
    minutes += day.minutes;
    userMsgs += day.userMsgs;
    for (const s of day.sessions) sessions.add(s);
    for (const [model, use] of Object.entries(day.models)) {
      const m = (models[model] = models[model] || { model, in: 0, out: 0, cacheRead: 0, cache5m: 0, cache1h: 0, msgs: 0, cost: 0 });
      m.in += use.in; m.out += use.out; m.cacheRead += use.cacheRead;
      m.cache5m += use.cache5m; m.cache1h += use.cache1h;
      m.msgs += use.msgs; m.cost += use.cost;
    }
  }
  const list = Object.values(models).sort((a, b) => b.cost - a.cost);
  const sum = (k) => list.reduce((acc, m) => acc + m[k], 0);
  return {
    minutes,
    userMsgs,
    sessions: sessions.size,
    msgs: sum('msgs'),
    in: sum('in'),
    out: sum('out'),
    tokens: sum('in') + sum('out') + sum('cacheRead') + sum('cache5m') + sum('cache1h'),
    cost: sum('cost'),
    models: list,
  };
}

function frameStart(frame) {
  if (frame === 'All time') return null;
  const d = new Date();
  if (frame === '7 days') d.setDate(d.getDate() - 6);
  if (frame === '30 days') d.setDate(d.getDate() - 29);
  return iso(d);
}

function lastDays(days, n) {
  const out = [];
  let max = 1;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = iso(d);
    const day = days[key];
    const models = day ? Object.values(day.models) : [];
    const tokens = models.reduce((a, m) => a + m.in + m.out + m.cacheRead + m.cache5m + m.cache1h, 0);
    const cost = models.reduce((a, m) => a + m.cost, 0);
    max = Math.max(max, tokens);
    out.push({
      date: key,
      tokens,
      cost,
      minutes: day ? day.minutes : 0,
      label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      short: d.toLocaleDateString('en-GB', { weekday: 'narrow', day: 'numeric' }),
    });
  }
  for (const d of out) d.pct = Math.max(d.tokens > 0 ? 3 : 0, Math.round((d.tokens / max) * 100));
  return out;
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- formatting ----

function prettyModel(id) {
  const parts = id.replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-');
  const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${name} ${parts.slice(1).join('.')}` : name;
}

function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

function fmtMins(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function money(d) {
  return `$${d >= 100 ? Math.round(d) : d.toFixed(2)}`;
}

function clock(isoStr) {
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function weekLabel(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function until(isoStr) {
  const mins = Math.max(0, Math.round((new Date(isoStr).getTime() - Date.now()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

function timeAgo(when) {
  const mins = Math.floor((Date.now() - new Date(when).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
