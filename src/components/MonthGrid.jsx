// Reusable month calendar grid (weeks start Monday).
// Each section decides what a day cell contains via renderDay(dateISO, dayNumber).
import React from 'react';
import { todayISO } from '../lib/dates';
import { fmtMonth } from '../lib/dates';

export function MonthNav({ year, month, onChange }) {
  const move = (delta) => {
    const date = new Date(year, month + delta, 1);
    onChange(date.getFullYear(), date.getMonth());
  };
  const now = new Date();
  return (
    <div className="month-nav">
      <button className="btn small" onClick={() => move(-1)}>←</button>
      <h2>{fmtMonth(year, month)}</h2>
      <button className="btn small" onClick={() => move(1)}>→</button>
      <button className="btn small ghost" onClick={() => onChange(now.getFullYear(), now.getMonth())}>
        Today
      </button>
    </div>
  );
}

export default function MonthGrid({ year, month, renderDay, onDayClick, dayClass }) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayISO();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  return (
    <div>
      <div className="mg-head">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mg">
        {cells.map((iso, i) =>
          iso === null ? (
            <div key={`empty-${i}`} className="mg-day empty" />
          ) : (
            <div
              key={iso}
              className={`mg-day ${iso === today ? 'today' : ''} ${dayClass ? dayClass(iso) : ''}`}
              onClick={() => onDayClick?.(iso)}
            >
              <span className="num">{Number(iso.slice(8))}</span>
              {renderDay?.(iso)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
