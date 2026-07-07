// Trading — a P/L calendar: green day = profit, red = loss, hover for the
// amount. Tracks the monthly total against a goal you set, and lets you
// flick back through previous months.
import React, { useState } from 'react';
import { useStore } from '../../api';
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

export default function TradingSection() {
  const now = new Date();
  const [trading, setTrading] = useStore('trading', { days: {}, goals: {} });
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editingDay, setEditingDay] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);

  if (!trading) return null;

  const key = monthKey(year, month);
  const days = trading.days || {};
  const monthDays = Object.entries(days).filter(([iso]) => iso.startsWith(key));
  const total = monthDays.reduce((sum, [, v]) => sum + v, 0);
  const wins = monthDays.filter(([, v]) => v > 0);
  const losses = monthDays.filter(([, v]) => v < 0);
  const best = monthDays.reduce((acc, [iso, v]) => (v > (acc?.[1] ?? -Infinity) ? [iso, v] : acc), null);
  const worst = monthDays.reduce((acc, [iso, v]) => (v < (acc?.[1] ?? Infinity) ? [iso, v] : acc), null);
  const maxAbs = Math.max(1, ...monthDays.map(([, v]) => Math.abs(v)));

  // Goal for the viewed month — falls back to the most recently set goal.
  const goalValues = Object.entries(trading.goals || {}).sort();
  const goal = trading.goals?.[key] ?? (goalValues.length ? goalValues[goalValues.length - 1][1] : 500);

  function setDay(iso, amount) {
    const nextDays = { ...days };
    if (amount === null) delete nextDays[iso];
    else nextDays[iso] = amount;
    setTrading({ ...trading, days: nextDays });
    setEditingDay(null);
  }

  function saveGoal(value) {
    setTrading({ ...trading, goals: { ...trading.goals, [key]: value } });
    setEditingGoal(false);
  }

  return (
    <div>
      <SectionHead title="Trading" sub="Click a day to log profit or loss · hover a day for the amount" />

      <div className="grid cols-4 mb">
        <Stat label={`Total — ${key}`} value={<span style={{ color: total >= 0 ? 'var(--green)' : 'var(--red)' }}>{gbp(total)}</span>} hint={`${monthDays.length} trading days`} />
        <Stat label="Win rate" value={monthDays.length ? `${Math.round((wins.length / monthDays.length) * 100)}%` : '—'} hint={`${wins.length} green · ${losses.length} red`} />
        <Stat label="Best day" value={best ? gbp(best[1]) : '—'} hint={best ? fmtDate(best[0]) : ''} />
        <Stat label="Worst day" value={worst ? gbp(worst[1]) : '—'} hint={worst ? fmtDate(worst[0]) : ''} />
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
                <div className="day-tip">{fmtDate(iso)}: {gbp(days[iso])}</div>
              </>
            )
          }
        />
      </div>

      {editingDay && (
        <DayModal iso={editingDay} current={days[editingDay]} onClose={() => setEditingDay(null)} onSave={setDay} />
      )}
    </div>
  );
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

function DayModal({ iso, current, onClose, onSave }) {
  const [value, setValue] = useState(current ?? '');

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
            onKeyDown={(e) => e.key === 'Enter' && value !== '' && onSave(iso, Number(value))}
          />
        </Field>
      </div>
      <div className="foot">
        {current != null && (
          <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => onSave(iso, null)}>Clear day</button>
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={value === ''} onClick={() => onSave(iso, Number(value))}>Save</button>
      </div>
    </Modal>
  );
}
