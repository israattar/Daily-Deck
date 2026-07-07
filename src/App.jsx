import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import HealthSection from './sections/health/HealthSection';
import AcademicsSection from './sections/academics/AcademicsSection';
import CalendarSection from './sections/calendar/CalendarSection';
import TradingSection from './sections/trading/TradingSection';
import MessagesSection from './sections/messages/MessagesSection';
import WishlistSection from './sections/wishlist/WishlistSection';
import SettingsSection from './sections/settings/SettingsSection';

const SECTIONS = [
  { id: 'health', label: 'Health', component: HealthSection },
  { id: 'academics', label: 'Academics', component: AcademicsSection },
  { id: 'calendar', label: 'Calendar', component: CalendarSection },
  { id: 'trading', label: 'Trading', component: TradingSection },
  { id: 'messages', label: 'Messages', component: MessagesSection },
  { id: 'wishlist', label: 'Wishlist', component: WishlistSection },
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
