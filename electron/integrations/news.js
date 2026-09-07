// News — a personal front page: world news, the Iran–US / Middle East
// situation, tech & AI, British news, science, and astronomy. Each section
// mixes the mastheads Israa wants by name with a Google News query that
// brings in whoever else is covering the story today, so a section is never
// limited to a list somebody remembered to maintain. No API keys — every
// feed is public RSS. Results are cached for offline reading.
const store = require('./../store');

// Two kinds of feed:
//
//   Named outlets — a masthead Israa actually wants, read straight from its
//   own RSS. These carry artwork and a real summary.
//
//   `dynamic: true` — a Google News query rather than a publication. Google
//   answers with whoever is covering that subject right now (47-62 different
//   outlets in a single query), so the section is not limited to a list
//   somebody remembered to maintain. The cost is that these items have no
//   image and no real summary — Google repeats the headline — so they render
//   as text cards. Each item's true publisher comes from its <source> tag.
const GN = 'hl=en-GB&gl=GB&ceid=GB:en';

const FEEDS = [
  // Middle East / Iran–US
  { source: 'The Guardian', topic: 'Middle East', url: 'https://www.theguardian.com/world/middleeast/rss' },
  { source: 'The Guardian', topic: 'Middle East', url: 'https://www.theguardian.com/world/iran/rss' },
  { source: 'Arab News', topic: 'Middle East', url: 'https://www.arabnews.com/cat/1/rss.xml' },
  { source: 'Arab News', topic: 'Middle East', url: 'https://www.arabnews.com/rss.xml' },
  { source: 'Saudi Gazette', topic: 'Middle East', url: 'https://saudigazette.com.sa/rssFeed/74' },
  { source: 'Google News', topic: 'Middle East', dynamic: true,
    url: `https://news.google.com/rss/search?q=%22middle+east%22+OR+gaza+OR+iran+when:2d&${GN}` },

  // Tech & AI
  { source: 'The Guardian', topic: 'Tech & AI', url: 'https://www.theguardian.com/technology/rss' },
  { source: 'WIRED', topic: 'Tech & AI', url: 'https://www.wired.com/feed/rss' },
  { source: 'TechCrunch', topic: 'Tech & AI', url: 'https://techcrunch.com/feed/' },
  { source: 'The Next Web', topic: 'Tech & AI', url: 'https://thenextweb.com/feed' },
  { source: 'Google News', topic: 'Tech & AI', dynamic: true,
    url: `https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?${GN}` },

  // UK
  { source: 'The Guardian', topic: 'UK', url: 'https://www.theguardian.com/uk-news/rss' },
  { source: 'Google News', topic: 'UK', dynamic: true,
    url: `https://news.google.com/rss/headlines/section/topic/NATION?${GN}` },

  // Science (genetics, biology, physics...)
  { source: 'The Guardian', topic: 'Science', url: 'https://www.theguardian.com/science/rss' },
  { source: 'WIRED', topic: 'Science', url: 'https://www.wired.com/feed/category/science/latest/rss' },
  { source: 'Google News', topic: 'Science', dynamic: true,
    url: `https://news.google.com/rss/headlines/section/topic/SCIENCE?${GN}` },

  // Astronomy — space science, exploration, missions and research.
  { source: 'NASA', topic: 'Astronomy', url: 'https://www.nasa.gov/news-release/feed/' },
  { source: 'ESA', topic: 'Astronomy', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News' },
  { source: 'Space.com', topic: 'Astronomy', url: 'https://www.space.com/feeds/all' },
  { source: 'Spaceflight Now', topic: 'Astronomy', url: 'https://spaceflightnow.com/feed/' },
  { source: 'Universe Today', topic: 'Astronomy', url: 'https://www.universetoday.com/feed/' },
  { source: 'Astronomy.com', topic: 'Astronomy', url: 'https://www.astronomy.com/feed/' },
  { source: 'Phys.org', topic: 'Astronomy', url: 'https://phys.org/rss-feed/space-news/' },
  { source: 'Ars Technica', topic: 'Astronomy', url: 'https://arstechnica.com/science/space/feed/' },
  { source: 'The Guardian', topic: 'Astronomy', url: 'https://www.theguardian.com/science/space/rss' },
  { source: 'Google News', topic: 'Astronomy', dynamic: true,
    url: `https://news.google.com/rss/search?q=NASA+OR+astronomy+OR+spacecraft+when:3d&${GN}` },

  // World — what is happening generally, from wherever is covering it.
  // Al Jazeera publishes only one combined feed (their middleeast.xml is a
  // 404), and it is world-wide, so it belongs here rather than under Middle East.
  { source: 'Al Jazeera', topic: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'The Guardian', topic: 'World', url: 'https://www.theguardian.com/world/rss' },
  { source: 'Google News', topic: 'World', dynamic: true, url: `https://news.google.com/rss?${GN}` },
];

const PER_FEED = 15;
// Space outlets publish far more often than the UK desk does. Without a cap
// per topic the newest-first trim would let Astronomy crowd the others out.
const PER_TOPIC = 70;

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
    items: capPerTopic(items),
    sourceStatus: Object.values(bySource),
    refreshedAt: new Date().toISOString(),
  };
  store.save('news-cache', payload);
  return payload;
}

// Keeps PER_TOPIC stories per topic so a quiet desk still gets a look in.
//
// Within a topic it takes from each lane in turn rather than purely by date:
// Space.com and Phys.org post many times a day, and straight newest-first left
// NY Times Space with nothing and Spaceflight Now with one. Round-robin gives
// every lane its newest stories first. `items` arrives newest-first, so each
// lane's queue is already in the right order; the result is re-sorted by date
// for display.
//
// Lanes are feeds, not publishers. A Google query surfaces sixty outlets with
// one story each; balancing on the publisher would hand the aggregator sixty
// shares against the Guardian's one and bury the mastheads underneath it.
function capPerTopic(items) {
  const byTopic = new Map();
  for (const item of items) {
    if (!byTopic.has(item.topic)) byTopic.set(item.topic, new Map());
    const byLane = byTopic.get(item.topic);
    const lane = item.lane || item.source;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane).push(item);
  }

  const kept = [];
  for (const byLane of byTopic.values()) {
    const queues = [...byLane.values()];
    let taken = 0;
    for (let round = 0; taken < PER_TOPIC; round++) {
      let addedThisRound = false;
      for (const queue of queues) {
        if (round >= queue.length) continue;
        kept.push(queue[round]);
        addedThisRound = true;
        if (++taken >= PER_TOPIC) break;
      }
      if (!addedThisRound) break; // every outlet exhausted
    }
  }
  return kept.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
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

    // An aggregated item is published by somebody else: take the real outlet
    // from <source>, drop the " - Outlet" that Google appends to the headline,
    // and skip the description entirely — it is just the headline again, which
    // would print twice on the card.
    const publisher = feed.dynamic ? clean(tag(block, 'source')) : '';
    const outlet = publisher || feed.source;
    const suffix = ` - ${outlet}`;
    const headline = feed.dynamic && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;

    items.push({
      id: hash(link),
      title: headline,
      link,
      snippet: feed.dynamic ? '' : clean(tag(block, 'description')).slice(0, 200),
      image,
      source: outlet,
      // Which feed it arrived through, as opposed to who published it. The
      // per-topic cap balances by this, so one Google query counts as a single
      // lane rather than as sixty one-story outlets that would swamp the
      // mastheads it sits beside.
      lane: feed.source,
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
