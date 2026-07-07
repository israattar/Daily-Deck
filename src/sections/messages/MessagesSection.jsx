// Messages — reminders to reply to people, split by app, with a short
// note about what the conversation is about. Tick when you've replied.
import React, { useState } from 'react';
import { useStore } from '../../api';
import { SectionHead, Chip, Empty } from '../../components/ui';
import { daysUntil } from '../../lib/dates';

const APPS = [
  { id: 'snapchat', label: 'Snapchat', color: '#fffc00' },
  { id: 'instagram', label: 'Instagram', color: '#e1306c' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25d366' },
  { id: 'email', label: 'Email', color: '#5b8cff' },
];

export default function MessagesSection() {
  const [messages, setMessages] = useStore('messages', []);

  if (!messages) return null;

  const pending = messages.filter((m) => !m.done);

  return (
    <div>
      <SectionHead
        title="Messages"
        sub={pending.length ? `${pending.length} ${pending.length === 1 ? 'person' : 'people'} waiting on a reply` : 'Inbox zero — nobody is waiting on you 🎉'}
      />
      <div className="grid cols-4">
        {APPS.map((app) => (
          <AppColumn
            key={app.id}
            app={app}
            items={pending.filter((m) => m.app === app.id)}
            onAdd={(person, about) =>
              setMessages([
                { id: `msg:${Date.now()}`, app: app.id, person, about, addedAt: new Date().toISOString().slice(0, 10) },
                ...messages,
              ])
            }
            onDone={(id) => setMessages(messages.filter((m) => m.id !== id))}
          />
        ))}
      </div>
    </div>
  );
}

function AppColumn({ app, items, onAdd, onDone }) {
  const [person, setPerson] = useState('');
  const [about, setAbout] = useState('');

  function add() {
    if (!person.trim()) return;
    onAdd(person.trim(), about.trim());
    setPerson('');
    setAbout('');
  }

  return (
    <div className="msg-col">
      <div className="col-head">
        <span className="app-dot" style={{ background: app.color }} />
        {app.label}
        <span className="count">
          <Chip tone={items.length ? 'accent' : ''}>{items.length}</Chip>
        </span>
      </div>

      {items.length === 0 ? (
        <Empty icon="💬">All replied.</Empty>
      ) : (
        items.map((m) => {
          const waitedDays = -daysUntil(m.addedAt);
          return (
            <div className="row" key={m.id}>
              <div className="grow">
                <div className="title">{m.person}</div>
                {m.about && <div className="desc">{m.about}</div>}
                <div className="faint" style={{ marginTop: 3 }}>
                  {waitedDays <= 0 ? 'added today' : `waiting ${waitedDays} day${waitedDays === 1 ? '' : 's'}`}
                </div>
              </div>
              <button className="btn small" title="Replied!" onClick={() => onDone(m.id)}>✓</button>
            </div>
          );
        })
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        <input placeholder="Who?" value={person} onChange={(e) => setPerson(e.target.value)} />
        <input
          placeholder="About what?"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn small" onClick={add} disabled={!person.trim()}>+ Remind me</button>
      </div>
    </div>
  );
}
