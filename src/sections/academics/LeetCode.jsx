// LeetCode habit calendar: tick off each day you practised and record
// which problem numbers you solved. Tracks your streak.
import React, { useState } from 'react';
import { useStore } from '../../api';
import { SectionHead, Stat, Modal, Field } from '../../components/ui';
import MonthGrid, { MonthNav } from '../../components/MonthGrid';
import { addDays, todayISO, fmtDate } from '../../lib/dates';

export default function LeetCode() {
  const now = new Date();
  const [log, setLog] = useStore('leetcode', {});
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editingDay, setEditingDay] = useState(null);

  if (!log) return null;

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const daysThisMonth = Object.keys(log).filter((d) => d.startsWith(monthPrefix)).length;

  // Streak: consecutive days ending today (or yesterday, so today isn't "lost" by 9am).
  let streak = 0;
  let cursor = log[todayISO()] ? todayISO() : addDays(todayISO(), -1);
  while (log[cursor]) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  function saveDay(iso, problems, note) {
    const next = { ...log };
    if (problems.trim() || note.trim()) next[iso] = { problems: problems.trim(), note: note.trim() };
    else delete next[iso];
    setLog(next);
    setEditingDay(null);
  }

  return (
    <div>
      <SectionHead title="LeetCode" sub="Click a day to log which problems you solved" />

      <div className="grid cols-3 mb">
        <Stat label="Current streak" value={streak} suffix="days" hint={streak > 0 ? 'keep it going 🔥' : 'solve one today to start'} />
        <Stat label="This month" value={daysThisMonth} suffix={`/ ${new Date(year, month + 1, 0).getDate()} days`} />
        <Stat label="All time" value={Object.keys(log).length} suffix="days practised" />
      </div>

      <div className="card">
        <div style={{ marginBottom: 14 }}>
          <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
        <MonthGrid
          year={year}
          month={month}
          onDayClick={(iso) => setEditingDay(iso)}
          renderDay={(iso) =>
            log[iso] && (
              <>
                <span className="tick">✓</span>
                <div className="mini">#{log[iso].problems}</div>
              </>
            )
          }
        />
      </div>

      {editingDay && (
        <DayModal
          iso={editingDay}
          entry={log[editingDay]}
          onClose={() => setEditingDay(null)}
          onSave={saveDay}
        />
      )}
    </div>
  );
}

function DayModal({ iso, entry, onClose, onSave }) {
  const [problems, setProblems] = useState(entry?.problems || '');
  const [note, setNote] = useState(entry?.note || '');

  return (
    <Modal title={`LeetCode — ${fmtDate(iso)}`} onClose={onClose}>
      <div className="form">
        <Field label="Problem number(s)">
          <input value={problems} onChange={(e) => setProblems(e.target.value)} placeholder="e.g. 217, 1, 121" autoFocus />
        </Field>
        <Field label="Note (optional)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did it go? Tricky parts?" />
        </Field>
      </div>
      <div className="foot">
        {entry && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => onSave(iso, '', '')}>Clear day</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(iso, problems, note)}>Save</button>
      </div>
    </Modal>
  );
}
