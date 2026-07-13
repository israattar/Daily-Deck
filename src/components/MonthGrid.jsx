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

export default function MonthGrid({ year, month, renderDay, onDayClick, dayClass, hideWeekends }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayISO();

  const headers = hideWeekends
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const columns = { gridTemplateColumns: `repeat(${headers.length}, 1fr)` };

  // Place each day in its weekday column (Mon = 0). Weekends are dropped
  // entirely when hideWeekends is set, and the grid wraps every 5 columns.
  const cells = [];
  let placedFirst = false;
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = (new Date(year, month, day).getDay() + 6) % 7; // Mon=0 … Sun=6
    if (hideWeekends && weekday > 4) continue;
    if (!placedFirst) {
      for (let i = 0; i < weekday; i++) cells.push(null);
      placedFirst = true;
    }
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  return (
    <div>
      <div className="mg-head" style={columns}>
        {headers.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mg" style={columns}>
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
