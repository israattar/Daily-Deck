// Small shared building blocks used across every section.
import React from 'react';

export function SectionHead({ title, sub, children }) {
  return (
    <header className="section-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="actions">{children}</div>
    </header>
  );
}

export function Stat({ label, value, suffix, hint, children }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {children}
    </div>
  );
}

export function Chip({ tone = '', children }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function ProgressBar({ value, max, red }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress">
      <div className={`fill ${red ? 'red' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ icon = '✨', children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab} className={active === tab ? 'active' : ''} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}
