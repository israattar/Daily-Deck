// New internship openings, aggregated from The Trackr, Bright Network and
// GitHub tracker repos on every refresh. Each opening can be marked
// "Applied" (moves to My applications) or "Skip" (tucked away at the
// bottom, restorable any time).
import React, { useState } from 'react';
import { deck, isDesktop, openLink, useStore } from '../../api';
import { DEFAULT_SETTINGS, DEFAULT_STAGES } from '../../lib/defaults';
import { SectionHead, Chip, Empty } from '../../components/ui';
import { todayISO, daysUntil, countdownLabel, urgency } from '../../lib/dates';

const EMPTY_FEED = { cache: [], dismissed: {}, sourceStatus: [], lastRefresh: null };

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
  const [status, setStatus] = useState('all'); // all | open | upcoming
  const [category, setCategory] = useState('all');
  const [showSkipped, setShowSkipped] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const result = await deck.invoke('internships:refresh', settings?.internshipSources || {});
      setFeed({
        ...feed,
        cache: result.openings,
        sourceStatus: result.sourceStatus,
        lastRefresh: result.refreshedAt,
      });
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

  const fresh = sortOpenings(feed.cache.filter((o) => !feed.dismissed[o.id] && matchesFilters(o)));
  const skipped = sortOpenings(feed.cache.filter((o) => feed.dismissed[o.id] && matchesFilters(o)));

  // Category dropdown options come from everything currently matching.
  const catCounts = new Map();
  for (const o of feed.cache) {
    if (feed.dismissed[o.id]) continue;
    for (const c of o.categories || []) catCounts.set(c, (catCounts.get(c) || 0) + 1);
  }
  if (category !== 'all' && !catCounts.has(category)) catCounts.set(category, 0);
  const categories = [...catCounts.keys()].sort();

  function markApplied(opening) {
    setApplications([
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
      ...applications,
    ]);
    setFeed({ ...feed, dismissed: { ...feed.dismissed, [opening.id]: true } });
  }

  function skip(opening) {
    setFeed({ ...feed, dismissed: { ...feed.dismissed, [opening.id]: true } });
  }

  function restore(opening) {
    const dismissed = { ...feed.dismissed };
    delete dismissed[opening.id];
    setFeed({ ...feed, dismissed });
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
              ? 'No openings loaded yet. Refresh to fetch from The Trackr, Bright Network and your GitHub repos (configure sources in Settings).'
              : 'Nothing matches these filters — or you are all caught up. 🎉'}
          </Empty>
        </div>
      ) : (
        fresh.map((o) => (
          <OpeningRow key={o.id} opening={o}>
            <button className="btn small primary" onClick={() => markApplied(o)}>✓ Applied</button>
            <button className="btn small danger" onClick={() => skip(o)}>✕ Skip</button>
          </OpeningRow>
        ))
      )}

      {skipped.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="btn small ghost" onClick={() => setShowSkipped(!showSkipped)}>
            {showSkipped ? '▾ Hide skipped' : `▸ Skipped (${skipped.length})`}
          </button>
          {showSkipped && (
            <div style={{ marginTop: 8, opacity: 0.7 }}>
              {skipped.map((o) => (
                <OpeningRow key={o.id} opening={o}>
                  <button className="btn small primary" onClick={() => markApplied(o)}>✓ Applied</button>
                  <button className="btn small" onClick={() => restore(o)}>↩ Restore</button>
                </OpeningRow>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One opening in the list; action buttons are passed in as children.
function OpeningRow({ opening: o, children }) {
  return (
    <div className="row">
      <div className="grow">
        <div className="title">
          {o.company} — {o.role}
        </div>
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
