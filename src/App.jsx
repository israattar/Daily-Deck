import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import HealthSection from './sections/health/HealthSection';
import AcademicsSection from './sections/academics/AcademicsSection';
import CalendarSection from './sections/calendar/CalendarSection';
import TradingSection from './sections/trading/TradingSection';
import PrayerSection from './sections/prayer/PrayerSection';
import NewsSection from './sections/news/NewsSection';
import MessagesSection from './sections/messages/MessagesSection';
import NotesSection from './sections/notes/NotesSection';
import WishlistSection from './sections/wishlist/WishlistSection';
import ClaudeSection from './sections/claude/ClaudeSection';
import SettingsSection from './sections/settings/SettingsSection';

const SECTIONS = [
  { id: 'health', label: 'Health', component: HealthSection },
  { id: 'academics', label: 'Academics', component: AcademicsSection },
  { id: 'calendar', label: 'Calendar', component: CalendarSection },
  { id: 'trading', label: 'Trading', component: TradingSection },
  { id: 'prayer', label: 'Prayer', component: PrayerSection },
  { id: 'news', label: 'News', component: NewsSection },
  { id: 'messages', label: 'Messages', component: MessagesSection },
  { id: 'notes', label: 'Notes', component: NotesSection },
  { id: 'wishlist', label: 'Wishlist', component: WishlistSection },
  { id: 'claude', label: 'Claude', component: ClaudeSection },
];

export default function App() {
  const [active, setActive] = useState(() => localStorage.getItem('deck:lastSection') || 'health');

  const select = (id) => {
    setActive(id);
    localStorage.setItem('deck:lastSection', id);
  };

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
