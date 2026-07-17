// News — pulls the topics Israa actually reads from each outlet's public
// RSS feed: the Iran–US / Middle East situation, tech & AI, British news,
// and science breakthroughs (astronomy, genetics, space). No API keys —
// these are all free public feeds. Results are cached for offline reading.
const store = require('./../store');

const FEEDS = [
  // Middle East / Iran–US
  { source: 'The Guardian', topic: 'Middle East', url: 'https://www.theguardian.com/world/middleeast/rss' },
  { source: 'The Guardian', topic: 'Middle East', url: 'https://www.theguardian.com/world/iran/rss' },
  { source: 'NY Times', topic: 'Middle East', url: 'https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml' },
  { source: 'Arab News', topic: 'Middle East', url: 'https://www.arabnews.com/cat/1/rss.xml' },
  { source: 'Arab News', topic: 'Middle East', url: 'https://www.arabnews.com/rss.xml' },
  { source: 'Saudi Gazette', topic: 'Middle East', url: 'https://saudigazette.com.sa/rssFeed/74' },

  // Tech & AI
  { source: 'The Guardian', topic: 'Tech & AI', url: 'https://www.theguardian.com/technology/rss' },
  { source: 'WIRED', topic: 'Tech & AI', url: 'https://www.wired.com/feed/rss' },
  { source: 'TechCrunch', topic: 'Tech & AI', url: 'https://techcrunch.com/feed/' },
  { source: 'The Next Web', topic: 'Tech & AI', url: 'https://thenextweb.com/feed' },
  { source: 'NY Times', topic: 'Tech & AI', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml' },

  // UK
  { source: 'The Guardian', topic: 'UK', url: 'https://www.theguardian.com/uk-news/rss' },

  // Science (astronomy, genetics, space...)
  { source: 'The Guardian', topic: 'Science', url: 'https://www.theguardian.com/science/rss' },
  { source: 'WIRED', topic: 'Science', url: 'https://www.wired.com/feed/category/science/latest/rss' },
  { source: 'NY Times', topic: 'Science', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Space.xml' },
  { source: 'NY Times', topic: 'Science', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml' },
];

const PER_FEED = 15;

async function refresh() {
  const results = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { feed, ok: true, items: parseFeed(await res.text(), feed) };
      } catch (err) {
        return { feed, ok: false, error: err.message, items: [] };
      }
    })
  );

  // Merge + dedupe (Guardian's Iran and Middle East feeds overlap).
  const seen = new Set();
  const items = [];
  for (const result of results) {
    for (const item of result.items) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

  // One status line per source (feeds from the same outlet are merged).
  const bySource = {};
  for (const r of results) {
    const s = (bySource[r.feed.source] = bySource[r.feed.source] || { name: r.feed.source, ok: true, count: 0 });
    s.count += r.items.length;
    if (!r.ok) { s.ok = false; s.error = r.error; }
  }

  const payload = {
    items: items.slice(0, 250),
    sourceStatus: Object.values(bySource),
    refreshedAt: new Date().toISOString(),
  };
  store.save('news-cache', payload);
  return payload;
}

function parseFeed(xml, feed) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items = [];
  for (const block of blocks.slice(0, PER_FEED)) {
    const title = clean(tag(block, 'title'));
    const link =
      clean(tag(block, 'link')) || (block.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    if (!title || !link.startsWith('http')) continue;

    const published = new Date(tag(block, 'pubDate') || tag(block, 'dc:date'));
    // Feeds vary: media:content (take the last — Guardian lists a 140px
    // thumb before the 460px version), media:thumbnail, enclosure, or an
    // <img> inside the description HTML. Attribute values are XML-escaped,
    // so decode &amp; or signed URLs (Guardian's s= param) return 403.
    const mediaUrls = [...block.matchAll(/<media:content[^>]+url="([^"]+)"/gi)].map((m) => m[1]);
    const rawImage =
      mediaUrls[mediaUrls.length - 1] ||
      (block.match(/<media:thumbnail[^>]+url="([^"]+)"/i) ||
        block.match(/<enclosure[^>]+url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) ||
        block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i) ||
        [])[1] ||
      null;
    const image = rawImage ? rawImage.replace(/&amp;/g, '&') : null;

    items.push({
      id: hash(link),
      title,
      link,
      snippet: clean(tag(block, 'description')).slice(0, 200),
      image,
      source: feed.source,
      topic: feed.topic,
      publishedAt: isNaN(published) ? null : published.toISOString(),
      // Badge the Iran–US conflict stories she's following closely.
      iranUs: /\biran\b|tehran|irgc/i.test(`${title}`),
    });
  }
  return items;
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

function clean(text) {
  return String(text)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // Some feeds HTML-escape their markup, so tags only appear after
    // decoding — strip once more.
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;|&#8212;|&mdash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

module.exports = { refresh };
