// Uni assignments: what's due (with day countdowns and notes), what's
// awaiting a grade (countdown to results day), and past grades.
import React, { useState } from 'react';
import { useStore } from '../../api';
import { SectionHead, Chip, Empty, Modal, Field } from '../../components/ui';
import { fmtDate, countdownLabel, urgency, todayISO } from '../../lib/dates';

export default function Assignments() {
  const [assignments, setAssignments] = useStore('assignments', []);
  const [editing, setEditing] = useState(null); // null | 'new' | assignment object

  if (!assignments) return null;

  const due = assignments.filter((a) => !a.submitted).sort(byDate('dueDate'));
  const awaiting = assignments.filter((a) => a.submitted && !a.grade).sort(byDate('gradeDate'));
  const graded = assignments.filter((a) => a.submitted && a.grade).sort(byDate('dueDate')).reverse();

  function save(assignment) {
    if (assignment.id) {
      setAssignments(assignments.map((a) => (a.id === assignment.id ? assignment : a)));
    } else {
      setAssignments([{ ...assignment, id: `asg:${Date.now()}` }, ...assignments]);
    }
    setEditing(null);
  }

  function update(id, patch) {
    setAssignments(assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  return (
    <div>
      <SectionHead title="Assignments" sub={`${due.length} due · ${awaiting.length} awaiting grades`}>
        <button className="btn primary" onClick={() => setEditing('new')}>+ New assignment</button>
      </SectionHead>

      <div className="card mb">
        <h3>📌 Current — due soon</h3>
        {due.length === 0 ? (
          <Empty icon="🏖️">Nothing due. Enjoy it.</Empty>
        ) : (
          due.map((a) => (
            <div className="row" key={a.id}>
              <div className="grow">
                <div className="title">{a.module} · {a.title}</div>
                <div className="desc">due {fmtDate(a.dueDate)}{a.notes ? ` — ${a.notes}` : ''}</div>
              </div>
              <Chip tone={urgency(a.dueDate)}>{countdownLabel(a.dueDate, 'due')}</Chip>
              <button className="btn small" onClick={() => update(a.id, { submitted: true, submittedAt: todayISO() })}>✓ Submitted</button>
              <button className="btn small ghost" onClick={() => setEditing(a)}>✎</button>
            </div>
          ))
        )}
      </div>

      <div className="card mb">
        <h3>⏳ Awaiting grades</h3>
        {awaiting.length === 0 ? (
          <Empty icon="📭">No submissions waiting on results.</Empty>
        ) : (
          awaiting.map((a) => (
            <div className="row" key={a.id}>
              <div className="grow">
                <div className="title">{a.module} · {a.title}</div>
                <div className="desc">submitted {fmtDate(a.submittedAt)}{a.notes ? ` — ${a.notes}` : ''}</div>
              </div>
              {a.gradeDate && <Chip tone={urgency(a.gradeDate)}>{countdownLabel(a.gradeDate, 'grades')}</Chip>}
              <GradeInput onSave={(grade) => update(a.id, { grade, gradedAt: todayISO() })} />
              <button className="btn small ghost" onClick={() => setEditing(a)}>✎</button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>🎓 Past assignments</h3>
        {graded.length === 0 ? (
          <Empty icon="🗂️">Grades will collect here.</Empty>
        ) : (
          graded.map((a) => (
            <div className="row" key={a.id}>
              <div className="grow">
                <div className="title">{a.module} · {a.title}</div>
                <div className="desc">due {fmtDate(a.dueDate)} · graded {fmtDate(a.gradedAt)}</div>
              </div>
              <Chip tone="green">{a.grade}</Chip>
              <button className="btn small ghost" onClick={() => setEditing(a)}>✎</button>
            </div>
          ))
        )}
      </div>

      {editing && (
        <EditModal
          assignment={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={(id) => {
            setAssignments(assignments.filter((a) => a.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function byDate(field) {
  return (a, b) => (a[field] || '9999').localeCompare(b[field] || '9999');
}

function GradeInput({ onSave }) {
  const [value, setValue] = useState('');
  return (
    <span style={{ display: 'flex', gap: 5 }}>
      <input placeholder="Grade" style={{ width: 70 }} value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn small" disabled={!value.trim()} onClick={() => onSave(value.trim())}>Save</button>
    </span>
  );
}

function EditModal({ assignment, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(
    assignment || { module: '', title: '', dueDate: todayISO(), gradeDate: '', notes: '', submitted: false }
  );
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal title={assignment ? 'Edit assignment' : 'New assignment'} onClose={onClose}>
      <div className="form">
        <Field label="Module"><input value={form.module} onChange={set('module')} autoFocus placeholder="e.g. COMP2211" /></Field>
        <Field label="Title"><input value={form.title} onChange={set('title')} placeholder="e.g. Coursework 2" /></Field>
        <Field label="Due date"><input type="date" value={form.dueDate || ''} onChange={set('dueDate')} /></Field>
        <Field label="Expected grade-release date (optional)"><input type="date" value={form.gradeDate || ''} onChange={set('gradeDate')} /></Field>
        <Field label="Notes"><textarea value={form.notes || ''} onChange={set('notes')} placeholder="Jot anything down…" /></Field>
      </div>
      <div className="foot">
        {assignment && <button className="btn danger" onClick={() => onDelete(assignment.id)} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!form.module.trim() || !form.title.trim()} onClick={() => onSave(form)}>Save</button>
      </div>
    </Modal>
  );
}
