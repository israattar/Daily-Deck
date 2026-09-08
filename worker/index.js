// Daily Deck's always-on half.
//
// The laptop app only fetches while it is switched on, so news and internships
// stop updating the moment the lid closes. This Worker runs the same fetchers
// on Cloudflare's schedule and keeps the results in KV, so the phone has
// current data whether or not the laptop exists that day.
//
// It deliberately does NOT try to be the whole app: MT4, Apple Health and the
// Claude usage reader all need files on the laptop and stay there.
import { refresh as refreshNews, TOPIC_GROUPS } from '../electron/integrations/news.js';
import { refreshAll as refreshInternships } from '../electron/integrations/internships.js';
import { kvStore } from './kv-store.js';

// Cloudflare gives a free-plan cron 10ms of CPU, and parsing all 29 news feeds
// measures ~12.5ms. So the news refresh is split three ways by topic and the
// crons are staggered; each slice measures ~3ms. The cron expression that
// fired us decides which slice runs.
const NEWS_SLICES = {
  '0,30 * * * *': TOPIC_GROUPS[0], // Astronomy — 10 feeds
  '10,40 * * * *': TOPIC_GROUPS[1], // Middle East + Science — 9 feeds
  '20,50 * * * *': TOPIC_GROUPS[2], // Tech & AI + UK + World — 10 feeds
};

// Three triggers is the free-plan limit, and all three are spent on news.
// Internships costs well under a millisecond, so rather than ask for a fourth
// it rides along with the first slice at these hours.
const INTERNSHIPS_HOURS = [6, 12, 18];
const INTERNSHIPS_SLICE = '0,30 * * * *';

export default {
  // ---- scheduled: the whole point of this Worker ----
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(event.cron, env, event.scheduledTime));
  },

  // ---- fetch: shared with the Pages Function, see handleApi below ----
  fetch: (request, env) => handleApi(request, env),
};

// The API itself. Exported so Cloudflare Pages can serve it from the same
// origin as the app: a phone that blocks third-party requests never sends a
// cross-site call at all, and same-origin means no CORS to get wrong.
export async function handleApi(request, env) {
    const url = new URL(request.url);
    const store = kvStore(env.DECK);

    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          // The page is served from Pages and this is a different origin, so
          // every call is cross-origin. A POST carrying Authorization and
          // Content-Type is "non-simple", so the browser sends an OPTIONS
          // preflight first and refuses the real request unless the reply
          // names the method as well as the headers. Omitting Allow-Methods
          // fails as a bare "Load failed" on the phone with nothing in the
          // Worker logs, because the POST is never sent.
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });

    if (request.method === 'OPTIONS') return json({});

    // The body is read once here and passed down, because a Request can only be
    // consumed a single time and the token may live inside it.
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      const raw = await request.text();
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
    }

    // One shared secret, set with `wrangler secret put DECK_TOKEN`.
    //
    // Accepted three ways, and the body matters most: an Authorization header
    // makes a cross-origin POST "non-simple", so the browser demands a CORS
    // preflight first. Safari caches a failed preflight and then refuses to
    // send anything at all — the request never leaves the phone and never
    // appears in the Worker logs. Putting the token in the body, with
    // Content-Type text/plain, keeps the request "simple" so no preflight is
    // ever needed and nothing can be cached wrongly.
    const supplied =
      (body && typeof body.token === 'string' ? body.token : '') ||
      (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') ||
      url.searchParams.get('k') ||
      '';
    if (!env.DECK_TOKEN || supplied !== env.DECK_TOKEN) {
      return json({ error: 'Bad or missing key' }, 401);
    }

    if (url.pathname === '/api/ping') {
      return json({ ok: true, app: 'daily-deck-worker' });
    }

    // GET /api/store/<name> — read a collection.
    const read = url.pathname.match(/^\/api\/store\/([a-z-]+)$/);
    if (read && request.method === 'GET') {
      return json({ name: read[1], data: await store.load(read[1], null) });
    }

    // PUT /api/store/<name> — write one, so the phone can save a skip or a
    // favourite while the laptop is off.
    if (read && request.method === 'PUT') {
      if (body === null) return json({ error: 'Body must be JSON' }, 400);
      // A PUT from a script sends the document itself; the phone wraps it as
      // { token, data } to keep the request preflight-free.
      const value = body && body.token && 'data' in body ? body.data : body;
      await store.save(read[1], value);
      return json({ ok: true });
    }

    // Manual trigger, handy for testing without waiting for a cron.
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const which = url.searchParams.get('what') || 'all';
      const done = await runNow(which, env);
      return json({ ok: true, ran: done });
    }

    // The same { channel, payload } contract phone-server.js speaks, so the UI
    // can point at either without knowing the difference.
    if (url.pathname === '/api/invoke' && request.method === 'POST') {
      const { channel, payload } = body || {};
      const handler = CLOUD_CHANNELS[channel];
      if (!handler) {
        // Everything to do with MT4, Apple Health or the Claude log needs files
        // on the laptop. Say so plainly rather than failing as if broken.
        return json({ error: `${channel} needs the laptop — not available here` }, 404);
      }
      try {
        return json({ result: await handler(payload || {}, store, env) });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: 'Unknown endpoint' }, 404);
}

// What the phone can do without the laptop. Anything absent from this map is
// laptop-only by nature, not an oversight.
const CLOUD_CHANNELS = {
  'store:load': ({ name, fallback = null }, store) => store.load(name, fallback),
  'store:save': async ({ name, data }, store) => {
    await store.save(name, data);
    return true;
  },
  'news:refresh': async (_payload, store) => {
    // One request refreshes the lot. The three-way split exists to fit the
    // cron CPU budget; a request from you is not on that budget.
    for (const topics of TOPIC_GROUPS) await refreshNewsSlice(store, topics);
    return store.load('news-cache', null);
  },
  'internships:refresh': async (_payload, store, env) => {
    await refreshInternshipsInto(store, env);
    const feed = await store.load('internships', null);
    return {
      openings: feed?.cache || [],
      sourceStatus: feed?.sourceStatus || [],
      refreshedAt: feed?.lastRefresh || null,
    };
  },
  'prayer:fetch': async ({ city }) => {
    const res = await fetch(
      `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city || 'London')}&country=UK&method=2`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`Prayer API responded ${res.status}`);
    return res.json();
  },
};

async function runSchedule(cron, env, scheduledTime) {
  const store = kvStore(env.DECK);
  const done = [];

  const topics = NEWS_SLICES[cron];
  if (topics) done.push(await refreshNewsSlice(store, topics));

  // Piggy-backed rather than given a trigger of its own — see the note above.
  const at = new Date(scheduledTime);
  if (cron === INTERNSHIPS_SLICE && at.getUTCMinutes() === 0 && INTERNSHIPS_HOURS.includes(at.getUTCHours())) {
    done.push(await refreshInternshipsInto(store, env));
  }
  return done;
}

// A slice refresh rewrites only its own topics and carries the rest across, so
// three partial runs add up to a complete front page.
async function refreshNewsSlice(store, topics) {
  const previous = await store.load('news-cache', null);
  const payload = await refreshNews({ store, topics, previous });
  return { kind: 'news', topics, items: payload.items.length };
}

async function refreshInternshipsInto(store, env) {
  const settings = (await store.load('settings', null)) || {};
  const previousFeed = (await store.load('internships', null)) || {};
  const result = await refreshInternships(
    settings.internshipSources || {},
    previousFeed.cache || []
  );
  // Preserve everything the UI owns — skips and their reasons — and replace
  // only what the refresh actually produced.
  await store.save('internships', {
    ...previousFeed,
    cache: result.openings,
    sourceStatus: result.sourceStatus,
    lastRefresh: result.refreshedAt,
    dismissed: previousFeed.dismissed || {},
  });
  return { kind: 'internships', openings: result.openings.length };
}

// Used by POST /api/refresh so a run can be forced without waiting.
async function runNow(what, env) {
  const store = kvStore(env.DECK);
  const done = [];
  if (what === 'all' || what === 'news') {
    for (const topics of TOPIC_GROUPS) done.push(await refreshNewsSlice(store, topics));
  }
  if (what === 'all' || what === 'internships') {
    done.push(await refreshInternshipsInto(store, env));
  }
  return done;
}
