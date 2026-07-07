// Calendar — your Apple (iCloud) calendars via their ICS subscription links,
// merged with "plans with friends" logged right here. Click a day for details.
import React, { useEffect, useMemo, useState } from 'react';
import { deck, isDesktop, useStore } from '../../api';
import { DEFAULT_SETTINGS } from '../../lib/defaults';
import { SectionHead, Chip, Empty, Modal, Field } from '../../components/ui';
import MonthGrid, { MonthNav } from '../../components/MonthGrid';
import { addDays, fmtDate, todayISO, countdownLabel } from '../../lib/dates';

const FRIEND_COLOR = '#ff7ac8';

export default function CalendarSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [cache, setCache] = useStore('calendar-cache', { events: [], fetchedAt: null, sourceStatus: [] });
  const [plans, setPlans] = useStore('plans', []);
  const [settings] = useStore('settings', DEFAULT_SETTINGS);
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [addingPlan, setAddingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const calendarsConfigured = (settings?.icsCalendars || []).some((c) => c.url?.trim());

  async function refresh() {
    if (!isDesktop || !calendarsConfigured) return;
    setRefreshing(true);
    try {
      const from = new Date(year, month - 1, 1).toISOString();
      const to = new Date(year, month + 2, 7).toISOString();
      const result = await deck.invoke('calendar:fetch', { calendars: settings.icsCalendars, from, to });
      setCache({ events: result.events, sourceStatus: result.sourceStatus, fetchedAt: new Date().toISOString() });
    } catch { /* keep last cache */ }
    setRefreshing(false);
  }

  // Refresh automatically when the section opens or the settings exist.
  useEffect(() => {
    if (settings) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings === null, year, month]);

  // Merge ICS events and friend plans into one per-day map.
  const byDay = useMemo(() => {
    const map = {};
    for (const event of cache?.events || []) {
      (map[event.date] = map[event.date] || []).push(event);
    }
    for (const plan of plans || []) {
      (map[plan.date] = map[plan.date] || []).push({
        id: plan.id,
        title: `${plan.title}${plan.friends ? ` · ${plan.friends}` : ''}`,
        date: plan.date,
        start: `${plan.date}T${plan.time || '12:00'}`,
        allDay: !plan.time,
        location: plan.place || '',
        calendar: 'Friends',
        color: FRIEND_COLOR,
        isPlan: true,
      });
    }
    for (const day of Object.values(map)) day.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return map;
  }, [cache, plans]);

  const upcoming = [];
  for (let i = 0; i < 14; i++) {
    const iso = addDays(todayISO(), i);
    if (byDay[iso]?.length) upcoming.push([iso, byDay[iso]]);
  }

  if (!plans || !cache) return null;

  return (
    <div>
      <SectionHead
        title="Calendar"
        sub={
          calendarsConfigured
            ? cache.fetchedAt ? `Synced ${new Date(cache.fetchedAt).toLocaleString('en-GB')}` : 'Syncing…'
            : 'Add your iCloud calendar links in Settings to see events here'
        }
      >
        <button className="btn" onClick={() => setAddingPlan(true)}>+ Plan with friends</button>
        <button className="btn primary" onClick={refresh} disabled={refreshing || !calendarsConfigured || !isDesktop}>
          {refreshing ? 'Syncing…' : '↻ Sync'}
        </button>
      </SectionHead>

      {cache.sourceStatus?.some((s) => !s.ok) && (
        <div className="source-status mb">
          {cache.sourceStatus.filter((s) => !s.ok).map((s) => (
            <Chip key={s.name} tone="red">{s.name}: {s.error}</Chip>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.9fr 1fr' }}>
        <div className="card">
          <div style={{ marginBottom: 14 }}>
            <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
          <MonthGrid
            year={year}
            month={month}
            dayClass={(iso) => (iso === selectedDay ? 'selected' : '')}
            onDayClick={setSelectedDay}
            renderDay={(iso) => {
              const events = byDay[iso] || [];
              return (
                <>
                  {events.slice(0, 3).map((e) => (
                    <div key={e.id} className="ev-dot" style={{ background: `${e.color}44`, color: e.color }}>
                      {e.title}
                    </div>
                  ))}
                  {events.length > 3 && <div className="mini">+{events.length - 3} more</div>}
                </>
              );
            }}
          />
        </div>

        <div>
          <div className="card mb">
            <h3>{fmtDate(selectedDay)}</h3>
            {(byDay[selectedDay] || []).length === 0 ? (
              <Empty icon="🗓️">Nothing on this day.</Empty>
            ) : (
              byDay[selectedDay].map((e) => (
                <div className="row" key={e.id}>
                  <span className="app-dot" style={{ background: e.color }} />
                  <div className="grow">
                    <div className="title">{e.title}</div>
                    <div className="desc">
                      {e.allDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {e.location && ` · ${e.location}`} · {e.calendar}
                    </div>
                  </div>
                  {e.isPlan && (
                    <button className="btn small danger" onClick={() => setPlans(plans.filter((p) => p.id !== e.id))}>✕</button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>Next 14 days</h3>
            {upcoming.length === 0 ? (
              <Empty icon="🌤️">A quiet fortnight ahead.</Empty>
            ) : (
              upcoming.map(([iso, events]) => (
                <div key={iso} style={{ marginBottom: 10 }}>
                  <div className="faint" style={{ marginBottom: 4 }}>
                    {fmtDate(iso)} · {countdownLabel(iso, '')}
                  </div>
                  {events.map((e) => (
                    <div key={e.id} style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '3px 0' }}>
                      <span className="app-dot" style={{ background: e.color }} />
                      <span style={{ fontSize: 13 }}>{e.title}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {addingPlan && (
        <PlanModal
          onClose={() => setAddingPlan(false)}
          onAdd={(plan) => {
            setPlans([...plans, plan]);
            setAddingPlan(false);
            setSelectedDay(plan.date);
          }}
        />
      )}
    </div>
  );
}

function PlanModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ title: '', friends: '', date: todayISO(), time: '', place: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal title="Plan with friends" onClose={onClose}>
      <div className="form">
        <Field label="What"><input value={form.title} onChange={set('title')} placeholder="e.g. Dinner, cinema, study sesh" autoFocus /></Field>
        <Field label="Who"><input value={form.friends} onChange={set('friends')} placeholder="e.g. Sara & Amina" /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Date"><input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Time (optional)"><input type="time" value={form.time} onChange={set('time')} /></Field>
        </div>
        <Field label="Where (optional)"><input value={form.place} onChange={set('place')} /></Field>
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={!form.title.trim()}
          onClick={() => onAdd({ ...form, id: `plan:${Date.now()}` })}
        >
          Add plan
        </button>
      </div>
    </Modal>
  );
}
