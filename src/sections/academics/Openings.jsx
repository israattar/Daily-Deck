// New internship openings, aggregated from The Trackr and GitHub tracker
// repos on every refresh. Each opening can be marked
// "Applied" (moves to My applications) or "Skip" (tucked away at the
// bottom, restorable any time).
import React, { useEffect, useState } from 'react';
import { deck, isDesktop, openLink, useStore } from '../../api';
import { DEFAULT_SETTINGS, DEFAULT_STAGES } from '../../lib/defaults';
import { SectionHead, Chip, Empty, Modal, Field } from '../../components/ui';
import { todayISO, daysUntil, countdownLabel, urgency } from '../../lib/dates';

const EMPTY_FEED = { cache: [], dismissed: {}, sourceStatus: [], lastRefresh: null };

// A dismissal used to be stored as plain `true`. It is now
// { at, reason } so skipping can record why — old entries still read as
// "skipped, no reason given", which is exactly what they were.
function reasonOf(entry) {
  return entry && typeof entry === 'object' ? (entry.reason || '') : '';
}

// Skips are keyed by company+role, NOT by the source's id. The Trackr
// occasionally reissues a programme's id, which used to detach the skip and
// make an opening she had already dealt with reappear as new. Company+role is
// the same identity the merge in internships.js already dedupes on.
function keyOf(opening) {
  return `${opening.company}|${opening.role}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

// One-time move of id-keyed skips onto stable keys, so nothing she has
// already skipped comes back. Unmatched keys are left alone rather than
// dropped — an unknown key costs nothing, a lost skip is a bug.
function migrateDismissed(feed) {
  const dismissed = feed.dismissed || {};
  const byId = new Map((feed.cache || []).map((o) => [o.id, o]));
  let changed = false;
  const next = {};
  for (const [key, value] of Object.entries(dismissed)) {
    const opening = byId.get(key);
    if (opening) {
      next[keyOf(opening)] = value;
      changed = true;
    } else {
      next[key] = value;
    }
  }
  return changed ? { ...feed, dismissed: next } : null;
}

// When an opening actually opened: Trackr gives openingDate,
// GitHub repos give the date it was posted.
function openedDate(o) {
  return o.openingDate || o.postedAt || null;
}

function openedAgoLabel(o) {
  const date = openedDate(o);
  if (!date) return null;
  const days = -daysUntil(date);
  if (days < 0) return null;
  if (days === 0) return 'opened today';
  if (days === 1) return 'opened yesterday';
  return `opened ${days} days ago`;
}

// Open ones first, newest-opened at the top; then the not-yet-open ones,
// soonest to open first. Undated entries sink to the end of their group.
function sortOpenings(list) {
  return list.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    const dateA = a.open ? openedDate(a) : a.openingDate;
    const dateB = b.open ? openedDate(b) : b.openingDate;
    if (dateA && dateB) {
      const byDate = a.open ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
      if (byDate !== 0) return byDate;
    } else if (dateA || dateB) {
      return dateA ? -1 : 1;
    }
    return a.company.localeCompare(b.company);
  });
}

export default function Openings() {
  const [feed, setFeed] = useStore('internships', EMPTY_FEED);
  const [applications, setApplications] = useStore('applications', []);
  const [settings] = useStore('settings', DEFAULT_SETTINGS);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // Defaults to what she can actually apply to right now; "All" and
  // "Not open yet" stay one click away in the dropdown.
  const [status, setStatus] = useState('open'); // all | open | upcoming
  const [category, setCategory] = useState('all');
  const [showSkipped, setShowSkipped] = useState(false);
  const [skipping, setSkipping] = useState(null); // opening awaiting a reason

  // Migrate id-keyed skips once, as soon as a feed with a cache is loaded.
  useEffect(() => {
    if (!feed?.cache?.length) return;
    const migrated = migrateDismissed(feed);
    if (migrated) setFeed(migrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed?.cache?.length]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const result = await deck.invoke('internships:refresh', settings?.internshipSources || {});
      // Functional update: a refresh can take seconds, and anything skipped
      // while it was in flight must survive it.
      setFeed((prev) => ({
        ...(prev || EMPTY_FEED),
        cache: result.openings,
        sourceStatus: result.sourceStatus,
        lastRefresh: result.refreshedAt,
      }));
    } catch (err) {
      setError(err.message);
    }
    setRefreshing(false);
  }

  if (!feed || !applications) return null;

  const appliedKeys = new Set(applications.map((a) => `${a.company}|${a.role}`.toLowerCase()));
  const matchesFilters = (o) =>
    !appliedKeys.has(`${o.company}|${o.role}`.toLowerCase()) &&
    (status === 'all' || (status === 'open' ? o.open : !o.open)) &&
    (category === 'all' || (o.categories || []).includes(category)) &&
    (query === '' || `${o.company} ${o.role} ${o.location}`.toLowerCase().includes(query.toLowerCase()));

  // Honour both key styles: the stable one, and any id-keyed leftover from
  // before the migration ran.
  const isSkipped = (o) => feed.dismissed[keyOf(o)] ?? feed.dismissed[o.id];
  const fresh = sortOpenings(feed.cache.filter((o) => !isSkipped(o) && matchesFilters(o)));
  const skipped = sortOpenings(feed.cache.filter((o) => isSkipped(o) && matchesFilters(o)));

  // Category dropdown options come from everything currently matching.
  const catCounts = new Map();
  for (const o of feed.cache) {
    if (isSkipped(o)) continue;
    for (const c of o.categories || []) catCounts.set(c, (catCounts.get(c) || 0) + 1);
  }
  if (category !== 'all' && !catCounts.has(category)) catCounts.set(category, 0);
  const categories = [...catCounts.keys()].sort();

  function markApplied(opening) {
    setApplications((prev) => [
      {
        id: opening.id,
        company: opening.company,
        role: opening.role,
        url: opening.url,
        source: opening.source,
        appliedAt: todayISO(),
        stages: opening.stagesHint?.length ? ['Applied', ...opening.stagesHint] : [...DEFAULT_STAGES],
        stageIndex: 0,
        status: 'active',
        notes: '',
      },
      ...(prev || []),
    ]);
    setFeed((prev) => ({
      ...(prev || EMPTY_FEED),
      dismissed: { ...(prev?.dismissed || {}), [keyOf(opening)]: { at: todayISO(), reason: '' } },
    }));
  }

  // Skipping asks why first; the reason is optional and editable later.
  function saveSkip(opening, reason) {
    setFeed((prev) => ({
      ...(prev || EMPTY_FEED),
      dismissed: {
        ...(prev?.dismissed || {}),
        [keyOf(opening)]: { at: todayISO(), reason: reason.trim() },
      },
    }));
    setSkipping(null);
  }

  function restore(opening) {
    setFeed((prev) => {
      const dismissed = { ...(prev?.dismissed || {}) };
      delete dismissed[keyOf(opening)];
      delete dismissed[opening.id]; // any pre-migration leftover
      return { ...(prev || EMPTY_FEED), dismissed };
    });
  }

  return (
    <div>
      <SectionHead
        title="New openings"
        sub={
          feed.lastRefresh
            ? `${fresh.length} to review · refreshed ${new Date(feed.lastRefresh).toLocaleString('en-GB')}`
            : 'Hit refresh to pull openings from all your sources'
        }
      >
        <input placeholder="Search company or role…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn primary" onClick={refresh} disabled={refreshing || !isDesktop}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </SectionHead>

      {(feed.sourceStatus.length > 0 || error) && (
        <div className="source-status mb">
          {feed.sourceStatus.map((s) => (
            <Chip key={s.name} tone={s.ok ? 'green' : 'red'}>
              {s.name}: {s.ok ? `${s.count} found` : s.error}
            </Chip>
          ))}
          {error && <Chip tone="red">{error}</Chip>}
        </div>
      )}

      <div className="mb" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="open">Open now</option>
          <option value="upcoming">Not open yet</option>
        </select>
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c} ({catCounts.get(c)})</option>
            ))}
          </select>
        )}
      </div>

      {fresh.length === 0 ? (
        <div className="card">
          <Empty icon="🎓">
            {feed.cache.length === 0
              ? 'No openings loaded yet. Refresh to fetch from The Trackr and your GitHub repos (configure sources in Settings).'
              : 'Nothing matches these filters — or you are all caught up. 🎉'}
          </Empty>
        </div>
      ) : (
        fresh.map((o) => (
          <OpeningRow key={o.id} opening={o}>
            <button className="btn small primary" onClick={() => markApplied(o)}>✓ Applied</button>
            <button className="btn small danger" onClick={() => setSkipping(o)}>✕ Skip</button>
          </OpeningRow>
        ))
      )}

      {skipped.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="btn small ghost" onClick={() => setShowSkipped(!showSkipped)}>
            {showSkipped ? '▾ Hide skipped' : `▸ Skipped (${skipped.length})`}
          </button>
          {showSkipped && (
            <div style={{ marginTop: 8 }}>
              {skipped.map((o) => (
                <OpeningRow
                  key={o.id}
                  opening={o}
                  reason={reasonOf(isSkipped(o))}
                  onEditReason={() => setSkipping(o)}
                >
                  <button className="btn small primary" onClick={() => markApplied(o)}>✓ Applied</button>
                  <button className="btn small" onClick={() => restore(o)}>↩ Restore</button>
                </OpeningRow>
              ))}
            </div>
          )}
        </div>
      )}

      {skipping && (
        <SkipReasonModal
          opening={skipping}
          initial={reasonOf(isSkipped(skipping))}
          alreadySkipped={!!isSkipped(skipping)}
          onCancel={() => setSkipping(null)}
          onSave={(reason) => saveSkip(skipping, reason)}
        />
      )}
    </div>
  );
}

// Asks why an opening is being skipped. The reason is optional — saving with
// an empty box is a normal outcome, not an error.
function SkipReasonModal({ opening, initial, alreadySkipped, onCancel, onSave }) {
  const [reason, setReason] = useState(initial || '');

  return (
    <Modal title={alreadySkipped ? 'Edit skip reason' : 'Skip this opening'} onClose={onCancel}>
      <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
        {opening.company} — {opening.role}
      </p>
      <Field label="Why are you skipping it? (optional)">
        <textarea
          rows={3}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(reason);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="e.g. needs a visa, deadline passed, not my field…"
        />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(reason)}>
          {alreadySkipped ? 'Save reason' : 'Skip it'}
        </button>
      </div>
    </Modal>
  );
}

// One opening in the list; action buttons are passed in as children.
// Skipped rows also carry the reason, which doubles as the edit control.
function OpeningRow({ opening: o, children, reason, onEditReason }) {
  return (
    <div className="row">
      <div className="grow">
        <div className="title">
          {o.company} — {o.role}
        </div>
        {onEditReason && (
          <button className="skip-reason" onClick={onEditReason} title="Click to edit this reason">
            {reason
              ? <span>{reason}</span>
              : <span className="none">No further information</span>}
            <span className="pencil">✎</span>
          </button>
        )}
        <div className="desc" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
          <Chip tone="accent">{o.source}</Chip>
          {o.location && <Chip>{o.location}</Chip>}
          {(o.categories || []).slice(0, 2).map((c) => <Chip key={c} tone="blue">{c}</Chip>)}
          {o.open ? (
            <Chip tone="green">{openedAgoLabel(o) || 'open'}</Chip>
          ) : (
            <Chip tone="amber">
              {o.openingDate && daysUntil(o.openingDate) > 0
                ? countdownLabel(o.openingDate, 'opens')
                : 'not open yet'}
            </Chip>
          )}
          {o.closingDate && <Chip tone={urgency(o.closingDate)}>{countdownLabel(o.closingDate, 'closes')}</Chip>}
        </div>
      </div>
      {o.url && <button className="btn small" onClick={() => openLink(o.url)}>↗ Open</button>}
      {children}
    </div>
  );
}
