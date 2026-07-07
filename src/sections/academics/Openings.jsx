// New internship openings, aggregated from The Trackr, Bright Network and
// GitHub tracker repos on every refresh. Each opening can be marked
// "Applied" (moves to My applications) or "Skip" (never shown again).
import React, { useState } from 'react';
import { deck, isDesktop, openLink, useStore } from '../../api';
import { DEFAULT_SETTINGS, DEFAULT_STAGES } from '../../lib/defaults';
import { SectionHead, Chip, Empty } from '../../components/ui';
import { todayISO, countdownLabel, urgency } from '../../lib/dates';

const EMPTY_FEED = { cache: [], dismissed: {}, sourceStatus: [], lastRefresh: null };

export default function Openings() {
  const [feed, setFeed] = useStore('internships', EMPTY_FEED);
  const [applications, setApplications] = useStore('applications', []);
  const [settings] = useStore('settings', DEFAULT_SETTINGS);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

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
  const fresh = feed.cache.filter(
    (o) =>
      !feed.dismissed[o.id] &&
      !appliedKeys.has(`${o.company}|${o.role}`.toLowerCase()) &&
      (query === '' || `${o.company} ${o.role} ${o.location}`.toLowerCase().includes(query.toLowerCase()))
  );

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

  return (
    <div>
      <SectionHead
        title="New openings"
        sub={feed.lastRefresh ? `${fresh.length} to review · refreshed ${new Date(feed.lastRefresh).toLocaleString('en-GB')}` : 'Hit refresh to pull openings from all your sources'}
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

      {fresh.length === 0 ? (
        <div className="card">
          <Empty icon="🎓">
            {feed.cache.length === 0
              ? 'No openings loaded yet. Refresh to fetch from The Trackr, Bright Network and your GitHub repos (configure sources in Settings).'
              : 'All caught up — you have reviewed every opening. 🎉'}
          </Empty>
        </div>
      ) : (
        fresh.map((o) => (
          <div className="row" key={o.id}>
            <div className="grow">
              <div className="title">
                {o.company} — {o.role}
              </div>
              <div className="desc" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                <Chip tone="accent">{o.source}</Chip>
                {o.location && <Chip>{o.location}</Chip>}
                {o.open ? <Chip tone="green">open</Chip> : <Chip tone="amber">not open yet</Chip>}
                {o.closingDate && <Chip tone={urgency(o.closingDate)}>{countdownLabel(o.closingDate, 'closes')}</Chip>}
                {o.postedAt && <Chip>posted {o.postedAt}</Chip>}
              </div>
            </div>
            {o.url && (
              <button className="btn small" onClick={() => openLink(o.url)}>↗ Open</button>
            )}
            <button className="btn small primary" onClick={() => markApplied(o)}>✓ Applied</button>
            <button className="btn small danger" onClick={() => skip(o)}>✕ Skip</button>
          </div>
        ))
      )}
    </div>
  );
}
