// Left icon rail — one button per section.
import React from 'react';

const ICONS = {
  health: (
    <path d="M12 21s-7.5-4.6-10-9.6C.6 8.5 2.4 5 5.8 5c2 0 3.4 1.1 4.2 2.4h4c.8-1.3 2.2-2.4 4.2-2.4 3.4 0 5.2 3.5 3.8 6.4-2.5 5-10 9.6-10 9.6z" transform="scale(0.9) translate(1.3 1)" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  ),
  academics: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5z" />
      <path d="M6.5 11.5v4.6c0 1.2 2.5 2.4 5.5 2.4s5.5-1.2 5.5-2.4v-4.6" />
      <path d="M21 10v5" />
    </g>
  ),
  calendar: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5" />
    </g>
  ),
  trading: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 20.5h17" />
      <path d="M4.5 16.5 9 11l3.5 3.5L20 6.5" />
      <path d="M15.5 6.5H20V11" />
    </g>
  ),
  prayer: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20.5h18" />
      <path d="M6.5 20.5v-7h11v7" />
      <path d="M8.3 13.5c0-2.8 1.9-4 3.7-5.4 1.8 1.4 3.7 2.6 3.7 5.4" />
      <path d="M12 8.1V6.6" />
      <path d="M4.6 20.5V11M19.4 20.5V11" />
      <path d="M3.7 11l.9-1.7.9 1.7M18.5 11l.9-1.7.9 1.7" />
      <path d="M10.6 20.5v-2.3a1.4 1.4 0 0 1 2.8 0v2.3" />
    </g>
  ),
  news: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h13a1 1 0 0 1 1 1V18a2.5 2.5 0 0 0 2.5-2.5V8" transform="translate(0 .5)" />
      <path d="M4 6h14v11.5a2.5 2.5 0 0 0 2.5 2.5H6.5A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M7 9.5h8M7 12.5h8M7 15.5h5" />
    </g>
  ),
  notes: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3.5h10.5L19 7v13.5H5z" />
      <path d="M15 3.5V7h4" />
      <path d="M8.2 11.2h7.6M8.2 14.6h7.6M8.2 18h4.6" />
    </g>
  ),
  wishlist: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8.5h14V12M12 8v12.5" />
      <path d="M12 8s-1-4.5-4-4.5C6 3.5 5.5 6 7 7c1.3.9 5 1 5 1zM12 8s1-4.5 4-4.5c2 0 2.5 2.5 1 3.5-1.3.9-5 1-5 1z" />
    </g>
  ),
  claude: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8" />
    </g>
  ),
  settings: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.5-2-3.5-2.3 1a7.7 7.7 0 0 0-2.1-1.2L14.6 3h-5.2l-.4 2.6a7.7 7.7 0 0 0-2.1 1.2l-2.3-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2.4l-2 1.5 2 3.5 2.3-1a7.7 7.7 0 0 0 2.1 1.2l.4 2.6h5.2l.4-2.6a7.7 7.7 0 0 0 2.1-1.2l2.3 1 2-3.5-2-1.5c.07-.4.1-.8.1-1.2z" />
    </g>
  ),
};

export default function Sidebar({ sections, active, onSelect }) {
  return (
    <nav className="sidebar">
      <div className="logo">DD</div>
      {sections.map(({ id, label }) => (
        <button
          key={id}
          className={`nav-btn ${active === id ? 'active' : ''}`}
          onClick={() => onSelect(id)}
        >
          <svg width="23" height="23" viewBox="0 0 24 24">{ICONS[id]}</svg>
          <span className="tip">{label}</span>
        </button>
      ))}
      <div className="spacer" />
      <button
        className={`nav-btn ${active === 'settings' ? 'active' : ''}`}
        onClick={() => onSelect('settings')}
      >
        <svg width="23" height="23" viewBox="0 0 24 24">{ICONS.settings}</svg>
        <span className="tip">Settings</span>
      </button>
    </nav>
  );
}
