// Notes — quick capture with the essentials from proper note apps:
// categories (with colours), pinning, search, archive, and an editor
// that autosizes. Everything lives in notes.json like the other sections.
import React, { useState } from 'react';
import { useStore } from '../../api';
import { SectionHead, Chip, Empty, Modal, Field } from '../../components/ui';

const EMPTY = {
  notes: [],
  categories: [
    { name: 'General', color: '#8b7cf7' },
    { name: 'Uni', color: '#5b8cff' },
    { name: 'Ideas', color: '#ff7ac8' },
  ],
};

export default function NotesSection() {
  const [data, setData] = useStore('notes', EMPTY);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | note

  if (!data) return null;
  const { notes, categories } = data;

  const matches = (n) =>
    (showArchived ? n.archived : !n.archived) &&
    (category === 'all' || n.category === category) &&
    (query === '' || `${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase()));

  const shown = notes
    .filter(matches)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));

  const colorOf = (name) => categories.find((c) => c.name === name)?.color || 'var(--accent)';

  function save(note) {
    const now = new Date().toISOString();
    if (note.id) {
      setData({ ...data, notes: notes.map((n) => (n.id === note.id ? { ...note, updatedAt: now } : n)) });
    } else {
      setData({
        ...data,
        notes: [{ ...note, id: `note:${Date.now()}`, createdAt: now, updatedAt: now }, ...notes],
      });
    }
    setEditing(null);
  }

  function patch(id, changes) {
    setData({
      ...data,
      notes: notes.map((n) => (n.id === id ? { ...n, ...changes, updatedAt: new Date().toISOString() } : n)),
    });
  }

  function remove(id) {
    setData({ ...data, notes: notes.filter((n) => n.id !== id) });
    setEditing(null);
  }

  function addCategory(name, color) {
    if (!name.trim() || categories.some((c) => c.name === name.trim())) return;
    setData({ ...data, categories: [...categories, { name: name.trim(), color }] });
  }

  const archivedCount = notes.filter((n) => n.archived).length;

  return (
    <div>
      <SectionHead title="Notes" sub={`${notes.filter((n) => !n.archived).length} notes · ${categories.length} categories`}>
        <input placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn primary" onClick={() => setEditing('new')}>+ New note</button>
      </SectionHead>

      <div className="mb" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>All</FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.name} active={category === c.name} color={c.color} onClick={() => setCategory(c.name)}>
            {c.name}
          </FilterChip>
        ))}
        {archivedCount > 0 && (
          <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '← Back to notes' : `🗃 Archived (${archivedCount})`}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <Empty icon={showArchived ? '🗃' : '📝'}>
            {showArchived ? 'Nothing archived.' : 'No notes here yet — jot something down.'}
          </Empty>
        </div>
      ) : (
        <div className="notes-grid">
          {shown.map((n) => (
            <div key={n.id} className={`note-card ${n.pinned ? 'pinned' : ''}`} onClick={() => setEditing(n)}>
              <button
                className={`note-pin ${n.pinned ? 'on' : ''}`}
                title={n.pinned ? 'Unpin' : 'Pin'}
                onClick={(e) => { e.stopPropagation(); patch(n.id, { pinned: !n.pinned }); }}
              >
                {n.pinned ? '★' : '☆'}
              </button>
              {n.title && <div className="note-title">{n.title}</div>}
              <div className="note-body">{n.body || <span className="faint">Empty note</span>}</div>
              <div className="note-foot">
                <Chip><span className="app-dot" style={{ background: colorOf(n.category) }} />{n.category}</Chip>
                <span className="faint">{relativeDate(n.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <NoteModal
          note={editing === 'new' ? null : editing}
          categories={categories}
          defaultCategory={category !== 'all' ? category : categories[0]?.name || 'General'}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={remove}
          onPatch={patch}
          onAddCategory={addCategory}
        />
      )}
    </div>
  );
}

function FilterChip({ active, color, onClick, children }) {
  return (
    <button
      className="btn small"
      style={active ? { borderColor: color || 'var(--accent)', color: color || 'var(--accent)', background: 'var(--surface-2)' } : {}}
      onClick={onClick}
    >
      {color && <span className="app-dot" style={{ background: color }} />}
      {children}
    </button>
  );
}

function NoteModal({ note, categories, defaultCategory, onClose, onSave, onDelete, onPatch, onAddCategory }) {
  const [form, setForm] = useState(
    note || { title: '', body: '', category: defaultCategory, pinned: false, archived: false }
  );
  const [newCat, setNewCat] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3ddc97');

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal title={note ? 'Edit note' : 'New note'} onClose={onClose}>
      <div className="form">
        <Field label="Title">
          <input value={form.title} onChange={set('title')} placeholder="Untitled" autoFocus />
        </Field>
        <Field label="Category">
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={form.category} onChange={set('category')} style={{ flex: 1 }}>
              {categories.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
            <input
              placeholder="+ new category"
              style={{ width: 120 }}
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCat.trim()) {
                  onAddCategory(newCat, newCatColor);
                  setForm({ ...form, category: newCat.trim() });
                  setNewCat('');
                }
              }}
            />
            <input type="color" value={newCatColor} style={{ width: 40, padding: 2 }} onChange={(e) => setNewCatColor(e.target.value)} />
          </div>
        </Field>
        <Field label="Note">
          <textarea
            value={form.body}
            onChange={set('body')}
            placeholder="Write anything…"
            style={{ minHeight: 180 }}
          />
        </Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <input type="checkbox" checked={!!form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
          📌 Pin to top
        </label>
      </div>
      <div className="foot">
        {note && (
          <span style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn danger" onClick={() => onDelete(note.id)}>Delete</button>
            <button
              className="btn ghost"
              onClick={() => { onPatch(note.id, { archived: !note.archived }); onClose(); }}
            >
              {note.archived ? '↩ Unarchive' : '🗃 Archive'}
            </button>
          </span>
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!form.title.trim() && !form.body.trim()} onClick={() => onSave(form)}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function relativeDate(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
