import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import PairScreen from './components/PairScreen';
import { isRemote, isCloud, remote } from './api';
import HealthSection from './sections/health/HealthSection';
import AcademicsSection from './sections/academics/AcademicsSection';
import CalendarSection from './sections/calendar/CalendarSection';
import TradingSection from './sections/trading/TradingSection';
import PrayerSection from './sections/prayer/PrayerSection';
import NewsSection from './sections/news/NewsSection';
import NotesSection from './sections/notes/NotesSection';
import ClaudeSection from './sections/claude/ClaudeSection';
import SettingsSection from './sections/settings/SettingsSection';

const SECTIONS = [
  { id: 'health', label: 'Health', component: HealthSection },
  { id: 'academics', label: 'Academics', component: AcademicsSection },
  { id: 'calendar', label: 'Calendar', component: CalendarSection },
  { id: 'trading', label: 'Trading', component: TradingSection },
  { id: 'prayer', label: 'Prayer', component: PrayerSection },
  { id: 'news', label: 'News', component: NewsSection },
  { id: 'notes', label: 'Notes', component: NotesSection },
  { id: 'claude', label: 'Claude', component: ClaudeSection },
];

export default function App() {
  const [active, setActive] = useState(() => localStorage.getItem('deck:lastSection') || 'health');
  // A phone opened without the key gets the pairing screen instead of a
  // wall of failed requests.
  const [paired, setPaired] = useState(() => (!isRemote && !isCloud) || remote.hasKey());

  const select = (id) => {
    setActive(id);
    localStorage.setItem('deck:lastSection', id);
  };

  if (!paired) return <PairScreen onPaired={() => setPaired(true)} />;

  const Section =
    active === 'settings'
      ? SettingsSection
      : SECTIONS.find((s) => s.id === active)?.component || HealthSection;

  return (
    <div className="app">
      <Sidebar sections={SECTIONS} active={active} onSelect={select} />
      <main className="main">
        <ErrorBanner onUnpair={() => setPaired(false)} />
        <Section />
      </main>
    </div>
  );
}

// A section that cannot reach its data draws its empty state, which reads
// exactly like "you have nothing" — so say what actually went wrong instead of
// leaving it to be guessed at.
function ErrorBanner({ onUnpair }) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onError = (event) => setMessage(event.detail);
    window.addEventListener('deck:error', onError);
    return () => window.removeEventListener('deck:error', onError);
  }, []);

  if (!message) return null;

  const notPaired = /not paired|check the key/i.test(message);

  return (
    <div className="error-banner">
      <span className="grow">{message}</span>
      {notPaired && (isRemote || isCloud) && (
        <button
          className="btn small"
          onClick={() => {
            remote.clearKey?.();
            onUnpair();
          }}
        >
          Enter key
        </button>
      )}
      <button className="btn small ghost" onClick={() => setMessage('')}>Dismiss</button>
    </div>
  );
}
