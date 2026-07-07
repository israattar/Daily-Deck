// Every application you've submitted, each with its own stage pipeline
// (CV screening → HackerRank → interview …) personalised per company.
// Click a stage dot to move to it; edit mode lets you rename/add/remove stages.
import React, { useState } from 'react';
import { openLink, useStore } from '../../api';
import { DEFAULT_STAGES } from '../../lib/defaults';
import { SectionHead, Chip, Empty, Modal, Field } from '../../components/ui';
import { fmtDate, todayISO } from '../../lib/dates';

export default function Applications() {
  const [applications, setApplications] = useStore('applications', []);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('active');

  if (!applications) return null;

  const shown = applications.filter((a) => (filter === 'all' ? true : a.status === filter));

  function update(id, patch) {
    setApplications(applications.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function remove(id) {
    setApplications(applications.filter((a) => a.id !== id));
  }

  return (
    <div>
      <SectionHead title="My applications" sub={`${applications.filter((a) => a.status === 'active').length} in progress · ${applications.filter((a) => a.status === 'offer').length} offers`}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="active">In progress</option>
          <option value="offer">Offers</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add manually</button>
      </SectionHead>

      {shown.length === 0 ? (
        <div className="card">
          <Empty icon="📮">Nothing here yet — mark openings as “Applied” or add one manually.</Empty>
        </div>
      ) : (
        shown.map((a) => <ApplicationCard key={a.id} app={a} onChange={(p) => update(a.id, p)} onDelete={() => remove(a.id)} />)
      )}

      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onAdd={(app) => {
            setApplications([app, ...applications]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function ApplicationCard({ app, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [newStage, setNewStage] = useState('');

  const statusTone = { active: 'blue', offer: 'green', rejected: 'red' }[app.status];

  return (
    <div className="card mb">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="title" style={{ fontSize: 15 }}>{app.company} — {app.role}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Chip tone={statusTone}>{app.status === 'active' ? 'in progress' : app.status}</Chip>
            <Chip>applied {fmtDate(app.appliedAt)}</Chip>
            {app.source && <Chip tone="accent">{app.source}</Chip>}
          </div>
        </div>
        {app.url && <button className="btn small" onClick={() => openLink(app.url)}>↗</button>}
        <select value={app.status} onChange={(e) => onChange({ status: e.target.value })}>
          <option value="active">In progress</option>
          <option value="offer">Offer 🎉</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="btn small ghost" onClick={() => setEditing(!editing)}>{editing ? 'Done' : '✎ Stages'}</button>
        <button className="btn small danger" onClick={onDelete}>🗑</button>
      </div>

      <div className="stages">
        {app.stages.map((stage, i) => (
          <div key={i} className={`stage ${i < app.stageIndex ? 'done' : ''} ${i === app.stageIndex ? 'current' : ''}`}>
            {i > 0 && <span className="bar" />}
            <span className="dot" title={`Move to “${stage}”`} onClick={() => onChange({ stageIndex: i })}>
              {i < app.stageIndex ? '✓' : i + 1}
            </span>
            <span className="name">{stage}</span>
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {app.stages.map((stage, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input
                value={stage}
                style={{ flex: 1 }}
                onChange={(e) => {
                  const stages = [...app.stages];
                  stages[i] = e.target.value;
                  onChange({ stages });
                }}
              />
              <button
                className="btn small danger"
                onClick={() => onChange({
                  stages: app.stages.filter((_, j) => j !== i),
                  stageIndex: Math.min(app.stageIndex, app.stages.length - 2),
                })}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder="Add a stage (e.g. HackerRank, Assessment centre)…"
              value={newStage}
              style={{ flex: 1 }}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStage.trim()) {
                  onChange({ stages: [...app.stages, newStage.trim()] });
                  setNewStage('');
                }
              }}
            />
            <button
              className="btn small"
              onClick={() => {
                if (newStage.trim()) {
                  onChange({ stages: [...app.stages, newStage.trim()] });
                  setNewStage('');
                }
              }}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      <textarea
        placeholder="Notes — recruiter names, deadlines, interview prep…"
        value={app.notes || ''}
        style={{ marginTop: 12 }}
        onChange={(e) => onChange({ notes: e.target.value })}
      />
    </div>
  );
}

function AddModal({ onClose, onAdd }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [url, setUrl] = useState('');

  return (
    <Modal title="Add application" onClose={onClose}>
      <div className="form">
        <Field label="Company"><input value={company} onChange={(e) => setCompany(e.target.value)} autoFocus /></Field>
        <Field label="Role"><input value={role} onChange={(e) => setRole(e.target.value)} /></Field>
        <Field label="Link (optional)"><input value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={!company.trim() || !role.trim()}
          onClick={() =>
            onAdd({
              id: `manual:${Date.now()}`,
              company: company.trim(),
              role: role.trim(),
              url: url.trim() || null,
              source: 'manual',
              appliedAt: todayISO(),
              stages: [...DEFAULT_STAGES],
              stageIndex: 0,
              status: 'active',
              notes: '',
            })
          }
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
