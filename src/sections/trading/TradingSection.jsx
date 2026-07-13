// Trading — a P/L calendar: green day = profit, red = loss, hover for the
// amount. Tracks the monthly total against a goal you set, and lets you
// flick back through previous months.
import React, { useEffect, useState } from 'react';
import { deck, isDesktop, useStore } from '../../api';
import { TRADING_PASSCODE } from '../../lib/defaults';
import { SectionHead, Stat, ProgressBar, Modal, Field } from '../../components/ui';
import MonthGrid, { MonthNav } from '../../components/MonthGrid';
import { fmtDate, monthKey } from '../../lib/dates';

const gbp = (n) => {
  const decimals = Math.abs(n) % 1 ? 2 : 0;
  return `${n < 0 ? '-' : ''}£${Math.abs(n).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

// The Trading section is passcode-locked. The dashboard renders behind a
// blur until the code is entered; navigating away re-locks it.
export default function TradingSection() {
  const [unlocked, setUnlocked] = useState(false);
  return (
    <div className="gate">
      <div className={unlocked ? '' : 'gate-blur'} aria-hidden={!unlocked}>
        <TradingDashboard />
      </div>
      {!unlocked && <PasscodeOverlay onUnlock={() => setUnlocked(true)} />}
    </div>
  );
}

function PasscodeOverlay({ onUnlock }) {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);

  function submit() {
    if (value === TRADING_PASSCODE) onUnlock();
    else {
      setWrong(true);
      setValue('');
      setTimeout(() => setWrong(false), 400);
    }
  }

  return (
    <div className="gate-overlay">
      <div className={`gate-card ${wrong ? 'wrong' : ''}`}>
        <div className="lock">🔒</div>
        <h2>Trading is locked</h2>
        <p className="muted">Enter your passcode to continue</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          placeholder="••••"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={submit}>
          Unlock
        </button>
        {wrong && <p style={{ color: 'var(--red)', marginTop: 8, fontSize: 12 }}>Wrong passcode</p>}
      </div>
    </div>
  );
}

function TradingDashboard() {
  const now = new Date();
  const [trading, setTrading] = useStore('trading', { days: {}, goals: {} });
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editingDay, setEditingDay] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [mt4Conn, setMt4Conn] = useState(null); // { running, fresh, lastSync, found }

  async function refreshStatus() {
    if (!isDesktop) return;
    try { setMt4Conn(await deck.invoke('trading:mt4Status')); } catch { /* ignore */ }
  }

  // Live updates from the MT4 Expert Advisor — reload when data lands.
  useEffect(() => {
    const off = deck.on('trading:updated', async () => {
      const fresh = await deck.load('trading', { days: {}, goals: {} });
      setTrading({ ...fresh });
      refreshStatus();
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening this tab makes sure MT4 is running, then keeps the status light fresh.
  useEffect(() => {
    if (!isDesktop) return;
    deck.invoke('trading:ensureMt4').finally(refreshStatus);
    const timer = setInterval(refreshStatus, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manually poke MT4 open when the status light is clicked.
  async function connectMt4() {
    setMt4Conn(null); // show "checking" briefly
    await deck.invoke('trading:ensureMt4').catch(() => {});
    refreshStatus();
  }

  async function importMT4() {
    setImporting(true);
    try {
      const result = await deck.invoke('trading:importMT4');
      if (!result.canceled) {
        setMessage(`Imported ${result.days} trading days (${result.from} → ${result.to}), net ${gbp(result.total)}.`);
        const fresh = await deck.load('trading', { days: {}, goals: {} });
        setTrading({ ...fresh });
      }
    } catch (err) {
      setMessage(err.message);
    }
    setImporting(false);
  }

  if (!trading) return null;

  const key = monthKey(year, month);
  const days = trading.days || {};
  const counts = trading.counts || {};
  const stats = trading.stats || {};
  const monthDays = Object.entries(days).filter(([iso]) => iso.startsWith(key));
  const total = monthDays.reduce((sum, [, v]) => sum + v, 0);
  const wins = monthDays.filter(([, v]) => v > 0);
  const losses = monthDays.filter(([, v]) => v < 0);
  const best = monthDays.reduce((acc, [iso, v]) => (v > (acc?.[1] ?? -Infinity) ? [iso, v] : acc), null);
  const worst = monthDays.reduce((acc, [iso, v]) => (v < (acc?.[1] ?? Infinity) ? [iso, v] : acc), null);
  const maxAbs = Math.max(1, ...monthDays.map(([, v]) => Math.abs(v)));

  // Per-trade stats for the month (from the MT4 reporter). Falls back to
  // day-level counting when no trade stats exist yet.
  const ms = sumStats(stats, key);
  const winCount = ms ? ms.w : wins.length;
  const lossCount = ms ? ms.l : losses.length;
  const statBasis = ms ? 'trades' : 'days';

  // Goal for the viewed month — falls back to the most recently set goal.
  const goalValues = Object.entries(trading.goals || {}).sort();
  const goal = trading.goals?.[key] ?? (goalValues.length ? goalValues[goalValues.length - 1][1] : 500);

  function setDay(iso, amount, trades) {
    const nextDays = { ...days };
    const nextCounts = { ...counts };
    if (amount === null) {
      delete nextDays[iso];
      delete nextCounts[iso];
    } else {
      nextDays[iso] = amount;
      if (trades) nextCounts[iso] = trades;
      else delete nextCounts[iso];
    }
    setTrading({ ...trading, days: nextDays, counts: nextCounts });
    setEditingDay(null);
  }

  function saveGoal(value) {
    setTrading({ ...trading, goals: { ...trading.goals, [key]: value } });
    setEditingGoal(false);
  }

  return (
    <div>
      <SectionHead title="Trading" sub="Click a day to log profit or loss · hover a day for the amount">
        <button className="btn" onClick={importMT4} disabled={importing || !isDesktop}>
          {importing ? 'Working…' : '⤓ Import MT4 report'}
        </button>
        <Mt4Light conn={mt4Conn} onClick={connectMt4} />
      </SectionHead>

      {message && <p className="muted mb">{message}</p>}

      <div className="grid cols-4 mb">
        <Stat label={`Total — ${key}`} value={<span style={{ color: total >= 0 ? 'var(--green)' : 'var(--red)' }}>{gbp(total)}</span>} hint={`${monthDays.length} trading days`} />
        <WinRateGauge wins={winCount} losses={lossCount} basis={statBasis} />
        <Stat label="Best day" value={best ? gbp(best[1]) : '—'} hint={best ? fmtDate(best[0]) : ''} />
        <Stat label="Worst day" value={worst ? gbp(worst[1]) : '—'} hint={worst ? fmtDate(worst[0]) : ''} />
      </div>

      <div className="grid cols-3 mb">
        <Stat label="Avg hold time" value={ms && ms.n ? fmtHold(ms.hs / ms.n) : '—'} hint={ms ? `across ${ms.n} trades` : 'syncs from MT4'} />
        <Stat label="Avg hold — wins" value={<span style={{ color: 'var(--green)' }}>{ms && ms.w ? fmtHold(ms.hws / ms.w) : '—'}</span>} hint={ms ? `${ms.w} winning trades` : ''} />
        <Stat label="Avg hold — losses" value={<span style={{ color: 'var(--red)' }}>{ms && ms.l ? fmtHold(ms.hls / ms.l) : '—'}</span>} hint={ms ? `${ms.l} losing trades` : ''} />
      </div>

      <div className="card mb">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Monthly goal</h3>
          {editingGoal ? (
            <GoalInput initial={goal} onSave={saveGoal} onCancel={() => setEditingGoal(false)} />
          ) : (
            <button className="btn small ghost" onClick={() => setEditingGoal(true)}>✎ {gbp(goal)}</button>
          )}
        </div>
        <ProgressBar value={Math.max(0, total)} max={goal} red={total < 0} />
        <p className="muted" style={{ marginTop: 8 }}>
          {gbp(total)} of {gbp(goal)}
          {total >= goal ? ' — goal hit! 🎉' : total >= 0 ? ` · ${gbp(goal - total)} to go` : ' · currently below zero'}
        </p>
      </div>

      <div className="card">
        <div style={{ marginBottom: 14 }}>
          <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
        <MonthGrid
          year={year}
          month={month}
          hideWeekends
          onDayClick={(iso) => setEditingDay(iso)}
          dayClass={(iso) => {
            const v = days[iso];
            if (v == null) return '';
            const strength = Math.abs(v) > maxAbs * 0.5 ? 'strong' : '';
            return `${v >= 0 ? 'pnl-pos' : 'pnl-neg'} ${strength}`;
          }}
          renderDay={(iso) =>
            days[iso] != null && (
              <>
                <div className="pnl-amt">{gbp(days[iso])}</div>
                <div className="day-tip">
                  {fmtDate(iso)}: {gbp(days[iso])}
                  {counts[iso] != null && ` · ${counts[iso]} trade${counts[iso] === 1 ? '' : 's'}`}
                </div>
              </>
            )
          }
        />
      </div>

      <YearTable year={year} days={days} counts={counts} stats={stats} />

      {editingDay && (
        <DayModal
          iso={editingDay}
          current={days[editingDay]}
          currentTrades={counts[editingDay]}
          onClose={() => setEditingDay(null)}
          onSave={setDay}
        />
      )}
    </div>
  );
}

// Sum the per-day trade stats for one month; null when there are none yet.
function sumStats(stats, monthPrefix) {
  const entries = Object.entries(stats).filter(([iso]) => iso.startsWith(monthPrefix));
  if (entries.length === 0) return null;
  const sum = { n: 0, w: 0, l: 0, hs: 0, hws: 0, hls: 0 };
  for (const [, s] of entries) {
    for (const k of Object.keys(sum)) sum[k] += Number(s[k]) || 0;
  }
  return sum;
}

// Hold time in friendly units: "2h 14m", "38m", "45s".
function fmtHold(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

// Semicircular win/loss gauge — red arc for losses, green for wins,
// with the counts at each end.
function WinRateGauge({ wins, losses, basis }) {
  const total = wins + losses;
  const pct = total ? Math.round((wins / total) * 100) : null;
  const lossFrac = total ? losses / total : 0;
  const gap = total && wins > 0 && losses > 0 ? 0.02 : 0;

  return (
    <div className="card stat gauge-card">
      <div>
        <div className="label">Win rate</div>
        <div className="value">{pct != null ? `${pct}%` : '—'}</div>
        <div className="hint">{total ? `of ${total} ${basis}` : 'no data yet'}</div>
      </div>
      <div className="gauge">
        <svg width="132" height="74" viewBox="0 0 132 74">
          {total === 0 && <path d={semiArc(66, 66, 52, 0, 1)} stroke="var(--surface-3)" strokeWidth="11" fill="none" strokeLinecap="round" />}
          {losses > 0 && (
            <path d={semiArc(66, 66, 52, 0, Math.max(0.02, lossFrac - gap))} stroke="var(--red)" strokeWidth="11" fill="none" strokeLinecap="round" />
          )}
          {wins > 0 && (
            <path d={semiArc(66, 66, 52, Math.min(0.98, lossFrac + gap), 1)} stroke="var(--green)" strokeWidth="11" fill="none" strokeLinecap="round" />
          )}
        </svg>
        <span className="gauge-num left">{losses}</span>
        <span className="gauge-num right">{wins}</span>
      </div>
    </div>
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

// Month-by-month breakdown of the viewed year.
function YearTable({ year, days, counts, stats }) {
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const prefix = monthKey(year, m);
    const entries = Object.entries(days).filter(([iso]) => iso.startsWith(prefix));
    const values = entries.map(([, v]) => v);
    const gains = values.filter((v) => v > 0);
    const lossesV = values.filter((v) => v < 0);
    const ms = sumStats(stats, prefix);
    const trades = ms
      ? ms.n
      : entries.reduce((sum, [iso]) => sum + (counts[iso] || 0), 0) || entries.length;

    rows.push({
      name: new Date(year, m, 1).toLocaleDateString('en-GB', { month: 'long' }),
      trades: values.length ? trades : 0,
      winPct: ms && ms.w + ms.l > 0
        ? Math.round((ms.w / (ms.w + ms.l)) * 1000) / 10
        : values.length ? Math.round((gains.length / values.length) * 1000) / 10 : 0,
      avgGain: gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0,
      avgLoss: lossesV.length ? lossesV.reduce((a, b) => a + b, 0) / lossesV.length : 0,
      biggestGain: gains.length ? Math.max(...gains) : 0,
      biggestLoss: lossesV.length ? Math.min(...lossesV) : 0,
      pnl: values.reduce((a, b) => a + b, 0),
    });
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Monthly info — {year}</h3>
      <table className="data">
        <thead>
          <tr>
            <th>Month</th><th>Trades</th><th>Win %</th><th>Avg gain</th><th>Avg loss</th>
            <th>Biggest gain</th><th>Biggest loss</th><th>P/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} style={{ opacity: r.trades ? 1 : 0.45 }}>
              <td>{r.name}</td>
              <td>{r.trades}</td>
              <td>{r.winPct}%</td>
              <td>{r.avgGain ? gbp(r.avgGain) : '—'}</td>
              <td>{r.avgLoss ? gbp(r.avgLoss) : '—'}</td>
              <td>{r.biggestGain ? gbp(r.biggestGain) : '—'}</td>
              <td>{r.biggestLoss ? gbp(r.biggestLoss) : '—'}</td>
              <td style={{ color: r.pnl > 0 ? 'var(--green)' : r.pnl < 0 ? 'var(--red)' : 'inherit', fontWeight: 700 }}>
                {r.pnl ? gbp(r.pnl) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Live MT4 connection light. Click to (re)open MT4 if it isn't running.
function Mt4Light({ conn, onClick }) {
  let tone = '';
  let label = 'Checking MT4…';
  if (conn) {
    if (!conn.found) { tone = 'red'; label = 'MT4 not found'; }
    else if (conn.running && conn.fresh) { tone = 'green'; label = `MT4 syncing${syncedAgo(conn.lastSync)}`; }
    else if (conn.running) { tone = 'amber'; label = 'MT4 open · waiting for sync'; }
    else { tone = 'red'; label = 'MT4 not running — click to open'; }
  }
  return (
    <button className={`status-light ${tone}`} onClick={onClick} title="Click to open MT4 and sync">
      <span className="led" />
      {label}
    </button>
  );
}

function syncedAgo(lastSync) {
  if (!lastSync) return '';
  const mins = Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000);
  if (mins <= 0) return ' · just now';
  if (mins === 1) return ' · 1 min ago';
  return ` · ${mins} min ago`;
}

function GoalInput({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  return (
    <span style={{ display: 'flex', gap: 6 }}>
      <input
        type="number"
        style={{ width: 110 }}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSave(Number(value) || 0)}
      />
      <button className="btn small primary" onClick={() => onSave(Number(value) || 0)}>Set</button>
      <button className="btn small ghost" onClick={onCancel}>✕</button>
    </span>
  );
}

function DayModal({ iso, current, currentTrades, onClose, onSave }) {
  const [value, setValue] = useState(current ?? '');
  const [trades, setTrades] = useState(currentTrades ?? '');

  const save = () => onSave(iso, Number(value), trades === '' ? null : Number(trades));

  return (
    <Modal title={`P/L — ${fmtDate(iso)}`} onClose={onClose}>
      <div className="form">
        <Field label="Result for the day (£) — use a minus for a loss">
          <input
            type="number"
            step="0.01"
            value={value}
            autoFocus
            placeholder="e.g. 125.50 or -80"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && value !== '' && save()}
          />
        </Field>
        <Field label="Number of trades (optional)">
          <input
            type="number"
            min="0"
            value={trades}
            placeholder="e.g. 3"
            onChange={(e) => setTrades(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && value !== '' && save()}
          />
        </Field>
      </div>
      <div className="foot">
        {current != null && (
          <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => onSave(iso, null)}>Clear day</button>
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={value === ''} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
