// Calendar — subscribed calendars via their ICS links, merged with the
// entries logged right here (social, interviews, assessments, deadlines).
// Click a day for details; anything added here can be edited or recategorised.
import React, { useEffect, useMemo, useState } from 'react';
import { deck, isDesktop, useStore } from '../../api';
import { DEFAULT_SETTINGS } from '../../lib/defaults';
import { SectionHead, Chip, Empty, Modal, Field } from '../../components/ui';
import MonthGrid, { MonthNav } from '../../components/MonthGrid';
import { addDays, fmtDate, todayISO, countdownLabel } from '../../lib/dates';

// Everything she adds by hand goes under one of these. Each has its own
// colour so a glance at the month grid says what kind of week it is, and its
// own label for the second field — "Who" only makes sense for friends.
const CATEGORIES = [
  { id: 'friends', label: 'Social', color: '#ff7ac8', whoLabel: 'Who', whoHint: 'e.g. Sara & Amina' },
  { id: 'interview', label: 'Interview', color: '#8b7cf7', whoLabel: 'Company', whoHint: 'e.g. Optiver' },
  { id: 'hirevue', label: 'HireVue', color: '#5b8cff', whoLabel: 'Company', whoHint: 'e.g. Goldman Sachs' },
  { id: 'assessment', label: 'Coding assessment', color: '#ffb454', whoLabel: 'Company', whoHint: 'e.g. Jane Street' },
  { id: 'assignment', label: 'Assignment', color: '#3ddc97', whoLabel: 'Module', whoHint: 'e.g. COMP26120' },
];

// Plans saved before categories existed were all friend plans.
function categoryOf(plan) {
  return CATEGORIES.find((c) => c.id === plan.category) || CATEGORIES[0];
}

export default function CalendarSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [cache, setCache] = useStore('calendar-cache', { events: [], fetchedAt: null, sourceStatus: [] });
  const [plans, setPlans] = useStore('plans', []);
  const [settings] = useStore('settings', DEFAULT_SETTINGS);
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [addingPlan, setAddingPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null); // the raw stored plan
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
      const cat = categoryOf(plan);
      (map[plan.date] = map[plan.date] || []).push({
        id: plan.id,
        title: `${plan.title}${plan.friends ? ` · ${plan.friends}` : ''}`,
        date: plan.date,
        start: `${plan.date}T${plan.time || '12:00'}`,
        allDay: !plan.time,
        location: plan.place || '',
        calendar: cat.label,
        color: cat.color,
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
        <button className="btn" onClick={() => setAddingPlan(true)}>+ Add to calendar</button>
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

      <div className="cat-legend mb">
        {CATEGORIES.map((c) => {
          const count = (plans || []).filter((p) => categoryOf(p).id === c.id).length;
          return (
            <button
              key={c.id}
              className="cat-pill"
              style={{ borderColor: `${c.color}66` }}
              onClick={() => setAddingPlan(c.id)}
              title={`Add a ${c.label.toLowerCase()} entry`}
            >
              <span className="dot" style={{ background: c.color }} />
              {c.label}
              {count > 0 && <span className="faint"> · {count}</span>}
            </button>
          );
        })}
      </div>

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
                  {/* Only entries added here are editable — iCloud events are
                      read-only mirrors of the real calendar. */}
                  {e.isPlan && (
                    <>
                      <button
                        className="btn small"
                        title="Edit this event"
                        onClick={() => setEditingPlan(plans.find((p) => p.id === e.id))}
                      >
                        ✎
                      </button>
                      <button
                        className="btn small danger"
                        title="Delete this event"
                        onClick={() => setPlans((prev) => (prev || []).filter((p) => p.id !== e.id))}
                      >
                        ✕
                      </button>
                    </>
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

      {(addingPlan || editingPlan) && (
        <PlanModal
          existing={editingPlan}
          initialCategory={typeof addingPlan === 'string' ? addingPlan : 'friends'}
          initialDate={selectedDay}
          onClose={() => { setAddingPlan(false); setEditingPlan(null); }}
          onSave={(plan) => {
            setPlans((prev) => {
              const list = prev || [];
              return editingPlan
                ? list.map((p) => (p.id === plan.id ? plan : p))
                : [...list, plan];
            });
            setAddingPlan(false);
            setEditingPlan(null);
            setSelectedDay(plan.date);
          }}
          onDelete={editingPlan ? () => {
            setPlans((prev) => (prev || []).filter((p) => p.id !== editingPlan.id));
            setEditingPlan(null);
          } : null}
        />
      )}
    </div>
  );
}

// Doubles as the add and edit form: `existing` prefills it and switches the
// wording, so changing an event's category is the same action as choosing one.
function PlanModal({ existing, initialCategory, initialDate, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(
    existing
      ? { category: 'friends', friends: '', time: '', place: '', ...existing }
      : {
          category: initialCategory || 'friends',
          title: '',
          friends: '',
          date: initialDate || todayISO(),
          time: '',
          place: '',
        }
  );
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const cat = CATEGORIES.find((c) => c.id === form.category) || CATEGORIES[0];

  const titleHint = {
    friends: 'e.g. Dinner, cinema, study sesh',
    interview: 'e.g. Final round — 2 interviewers',
    hirevue: 'e.g. HireVue — 5 questions',
    assessment: 'e.g. HackerRank OA, 90 mins',
    assignment: 'e.g. Coursework 2 deadline',
  }[cat.id];

  const placeHint = cat.id === 'friends' ? 'e.g. Northern Quarter' : 'room, link, or platform';

  return (
    <Modal title={existing ? 'Edit event' : 'Add to calendar'} onClose={onClose}>
      <div className="cat-choice">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`cat-pill ${c.id === form.category ? 'on' : ''}`}
            style={c.id === form.category
              ? { borderColor: c.color, background: `${c.color}22`, color: 'var(--text)' }
              : { borderColor: `${c.color}55` }}
            onClick={() => setForm({ ...form, category: c.id })}
          >
            <span className="dot" style={{ background: c.color }} />
            {c.label}
          </button>
        ))}
      </div>

      <div className="form">
        <Field label="What"><input value={form.title} onChange={set('title')} placeholder={titleHint} autoFocus /></Field>
        <Field label={`${cat.whoLabel} (optional)`}>
          <input value={form.friends} onChange={set('friends')} placeholder={cat.whoHint} />
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label={cat.id === 'assignment' || cat.id === 'assessment' ? 'Due date' : 'Date'}>
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
          <Field label="Time (optional)"><input type="time" value={form.time} onChange={set('time')} /></Field>
        </div>
        <Field label="Where (optional)"><input value={form.place} onChange={set('place')} placeholder={placeHint} /></Field>
      </div>

      <div className="foot">
        {onDelete && (
          <button className="btn small danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
            Delete
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={!form.title.trim()}
          onClick={() => onSave(existing ? { ...form } : { ...form, id: `plan:${Date.now()}` })}
        >
          {existing ? 'Save changes' : `Add ${cat.label.toLowerCase()}`}
        </button>
      </div>
    </Modal>
  );
}
