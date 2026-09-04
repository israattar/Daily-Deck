import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import PairScreen from './components/PairScreen';
import { isRemote, remote } from './api';
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
  const [paired, setPaired] = useState(() => !isRemote || remote.hasKey());

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
        <Section />
      </main>
    </div>
  );
}
