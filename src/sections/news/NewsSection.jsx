// News — a personal front page: the Iran–US / Middle East situation,
// tech & AI, British news, and science breakthroughs, pulled from the
// outlets Israa reads. Click a card to open the full article in the
// browser; read articles dim so the fresh ones stand out.
import React, { useEffect, useState } from 'react';
import { deck, isDesktop, openLink, useStore } from '../../api';
import { SectionHead, Chip, Empty } from '../../components/ui';

const TOPICS = ['All', 'Middle East', 'Tech & AI', 'UK', 'Science'];
const STALE_MS = 30 * 60 * 1000; // auto-refresh when older than 30 min

export default function NewsSection() {
  const [cache, setCache] = useStore('news-cache', { items: [], sourceStatus: [], refreshedAt: null });
  const [prefs, setPrefs] = useStore('news', { read: {} });
  const [topic, setTopic] = useState('All');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    if (!isDesktop) return;
    setRefreshing(true);
    setError('');
    try {
      setCache(await deck.invoke('news:refresh'));
    } catch (err) {
      setError(err.message);
    }
    setRefreshing(false);
  }

  // Refresh automatically when the section opens with a stale cache.
  useEffect(() => {
    if (cache === null) return;
    const age = cache.refreshedAt ? Date.now() - new Date(cache.refreshedAt).getTime() : Infinity;
    if (age > STALE_MS) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache === null]);

  if (!cache || !prefs) return null;

  const read = prefs.read || {};
  const items = cache.items.filter(
    (a) =>
      (topic === 'All' || a.topic === topic) &&
      (query === '' || `${a.title} ${a.snippet} ${a.source}`.toLowerCase().includes(query.toLowerCase()))
  );

  function openArticle(article) {
    openLink(article.link);
    if (!read[article.id]) {
      // keep the read list from growing forever
      const entries = Object.keys(read);
      const trimmed = entries.length > 900 ? {} : read;
      setPrefs({ ...prefs, read: { ...trimmed, [article.id]: true } });
    }
  }

  const counts = {};
  for (const a of cache.items) counts[a.topic] = (counts[a.topic] || 0) + 1;

  return (
    <div>
      <SectionHead
        title="News"
        sub={cache.refreshedAt ? `${cache.items.length} stories · updated ${timeAgo(cache.refreshedAt)}` : 'Hit refresh to pull your feeds'}
      >
        <input placeholder="Search stories…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn primary" onClick={refresh} disabled={refreshing || !isDesktop}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </SectionHead>

      {(cache.sourceStatus.some((s) => !s.ok) || error) && (
        <div className="source-status mb">
          {cache.sourceStatus.filter((s) => !s.ok).map((s) => (
            <Chip key={s.name} tone="red">{s.name}: {s.error}</Chip>
          ))}
          {error && <Chip tone="red">{error}</Chip>}
        </div>
      )}

      <div className="mb" style={{ display: 'flex', gap: 6 }}>
        <div className="tabs">
          {TOPICS.map((t) => (
            <button key={t} className={topic === t ? 'active' : ''} onClick={() => setTopic(t)}>
              {t}{t !== 'All' && counts[t] ? ` (${counts[t]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <Empty icon="📰">
            {cache.items.length === 0 ? 'No stories yet — refresh to load your feeds.' : 'Nothing matches.'}
          </Empty>
        </div>
      ) : (
        <div className="news-grid">
          {items.map((a) => (
            <article
              key={a.id}
              className={`news-card ${read[a.id] ? 'read' : ''}`}
              onClick={() => openArticle(a)}
              title="Open the full article in your browser"
            >
              {a.image && (
                <div className="news-thumb">
                  <img src={a.image} alt="" loading="lazy" />
                </div>
              )}
              <div className="news-body">
                <div className="news-meta">
                  <Chip tone="accent">{a.source}</Chip>
                  <Chip tone={TOPIC_TONE[a.topic]}>{a.topic}</Chip>
                  {a.iranUs && <Chip tone="red">Iran–US</Chip>}
                </div>
                <h4 className="news-title">{a.title}</h4>
                {a.snippet && <p className="news-snippet">{a.snippet}</p>}
                <div className="news-foot">
                  <span className="faint">{a.publishedAt ? timeAgo(a.publishedAt) : ''}</span>
                  <span className="faint">read ↗</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const TOPIC_TONE = { 'Middle East': 'amber', 'Tech & AI': 'blue', UK: 'green', Science: 'pink' };

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
