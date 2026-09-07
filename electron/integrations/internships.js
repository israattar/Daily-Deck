// Pulls internship openings from every configured source and merges them
// into one list. Sources: The Trackr API, SimplyTK (Supabase) and GitHub
// tracker repos (SimplifyJobs-style). An opening carried by more than one
// source appears once, tagged with all of them.

const HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' };

// `previous` is the currently cached list. A source that fails — or gets
// rate-limited, which Trackr signals as an empty 200 — keeps whatever it
// contributed last time instead of having it silently deleted. The stale rows
// go through the same merge, so they cannot resurface as duplicates of
// something a working source just returned.
async function refreshAll(sources = {}, previous = []) {
  const jobs = [];

  if (sources.trackr?.enabled !== false) {
    jobs.push(runSource('The Trackr', () => fetchTrackr(sources.trackr || {})));
  }
  if (sources.simplytk?.enabled !== false) {
    jobs.push(runSource('SimplyTK', () => fetchSimplyTk(sources.simplytk || {})));
  }
  for (const repoUrl of sources.githubRepos || []) {
    if (repoUrl.trim()) jobs.push(runSource(repoName(repoUrl), () => fetchGithubRepo(repoUrl)));
  }

  const results = await Promise.all(jobs);

  // Fresh data first so it wins on every field, then the carried-over rows.
  const carried = results
    .filter((result) => !result.ok)
    .map((result) => ({
      ...result,
      openings: (previous || []).filter((opening) => sourcesOf(opening).includes(result.name)),
    }));

  return {
    openings: mergeOpenings([...results, ...carried]),
    sourceStatus: results.map(({ openings, ...status }) => {
      const kept = carried.find((entry) => entry.name === status.name);
      return { ...status, count: openings.length, keptFromCache: kept ? kept.openings.length : 0 };
    }),
    refreshedAt: new Date().toISOString(),
  };
}

// Each source reports its own fetch time, and may also report how fresh the
// data itself is (dataAsOf) — a successful fetch of stale data should still
// look stale in the UI.
async function runSource(name, fetcher) {
  try {
    const outcome = await fetcher();
    const openings = Array.isArray(outcome) ? outcome : outcome.openings;
    return {
      name,
      ok: true,
      openings,
      refreshedAt: new Date().toISOString(),
      dataAsOf: Array.isArray(outcome) ? null : outcome.dataAsOf || null,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err.message,
      openings: [],
      refreshedAt: new Date().toISOString(),
      dataAsOf: null,
    };
  }
}

// ---------------------------------------------------------------- The Trackr
// Public API discovered from their web app. `process` describes the company's
// hiring stages, which we reuse to personalise the application tracker.
async function fetchTrackr(cfg) {
  const region = cfg.region || 'UK';
  const industry = cfg.industry || 'Tech';
  const seasons = cfg.seasons?.length ? cfg.seasons : [defaultSeason()];
  const types = cfg.types?.length ? cfg.types : ['summer-internships'];

  const openings = [];
  for (const season of seasons) {
    for (const type of types) {
      const url = `https://api.the-trackr.com/programmes?region=${region}&industry=${industry}&season=${season}&type=${type}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`Trackr responded ${res.status}`);
      // Throttling here looks exactly like success: 200 with an empty array
      // and a Retry-After header. Left alone it would quietly replace every
      // Trackr opening with nothing, so treat it as the failure it is.
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) throw new Error(`rate-limited, try again in ${retryLabel(retryAfter)}`);
      const body = await res.json();
      // As of ~Aug 2026 the API wraps results in { programmes, groups }
      // instead of returning a bare array — tolerate both shapes.
      const items = Array.isArray(body) ? body : body.programmes || [];
      for (const p of items) {
        openings.push({
          id: `trackr:${p.id}`,
          company: p.company?.name || p.companyId || 'Unknown',
          role: p.name,
          location: (p.locations || []).join(', '),
          categories: p.categories || [],
          url: p.url || null,
          sources: ['The Trackr'],
          open: !!p.url,
          openingDate: p.openingDate?.slice(0, 10) || null,
          closingDate: p.closingDate?.slice(0, 10) || null,
          stagesHint: stagesFromProcess(p.process),
        });
      }
    }
  }
  return openings;
}

function retryLabel(retryAfter) {
  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds)) return String(retryAfter);
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} hours`;
}

// Applications for next summer open in the autumn, so from July onwards
// the relevant Trackr season is next year's.
function defaultSeason() {
  const now = new Date();
  return String(now.getFullYear() + (now.getMonth() >= 5 ? 1 : 0));
}

function stagesFromProcess(process) {
  if (Array.isArray(process)) return process.map(String).filter(Boolean);
  if (typeof process !== 'string' || !process.trim()) return null;
  const parts = process.split(/→|->|>|\n|,|;/).map((s) => s.trim()).filter((s) => s.length > 2);
  return parts.length >= 2 ? parts : null;
}

// ------------------------------------------------------------------ SimplyTK
// simplytk.com is a UK-only live tracker. Its web app reads Supabase/PostgREST
// directly with a publishable read-only key, so we query the same endpoint
// rather than scraping the rendered page.
const SIMPLYTK_REST = 'https://kfrlrioicoltydcmkpoi.supabase.co/rest/v1';
const SIMPLYTK_KEY = 'sb_publishable_hNnlPAh4ZIFImgWU1p8gVg_SVEIuYOP';
const SIMPLYTK_SELECT =
  'id,title,division,location,city,deadline,apply_url,first_seen_at,source_posted_at,companies!inner(name,sector)';

function simplytkUrl(extra) {
  const params = new URLSearchParams({
    select: SIMPLYTK_SELECT,
    status: 'eq.open',
    order: 'first_seen_at.desc',
    limit: '500',
    ...extra,
  });
  return `${SIMPLYTK_REST}/jobs?${params}`;
}

async function simplytkGet(url) {
  const res = await fetch(url, { headers: { apikey: SIMPLYTK_KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`SimplyTK responded ${res.status}`);
  return res.json();
}

// When SimplyTK itself last verified its listings, as opposed to when we last
// fetched them.
async function simplytkDataAsOf() {
  const params = new URLSearchParams({
    select: 'last_seen_at',
    status: 'eq.open',
    order: 'last_seen_at.desc',
    limit: '1',
  });
  const rows = await simplytkGet(`${SIMPLYTK_REST}/jobs?${params}`).catch(() => []);
  return rows[0]?.last_seen_at || null;
}

async function fetchSimplyTk(cfg) {
  const programme = cfg.programmeType || 'summer_internship';
  const divisions = cfg.divisions?.length ? cfg.divisions : ['Software Engineering'];
  const sectors = cfg.sectors?.length ? cfg.sectors : ['tech'];

  // "Tech" lives in two different columns: the role's division (a software
  // engineering job at a bank) and the company's sector (any job at Google).
  // PostgREST cannot OR across an embedded table, so we ask twice and union.
  const [byDivision, bySector, dataAsOf] = await Promise.all([
    simplytkGet(
      simplytkUrl({
        programme_type: `eq.${programme}`,
        division: `in.(${divisions.map((d) => `"${d}"`).join(',')})`,
      })
    ),
    simplytkGet(
      simplytkUrl({
        programme_type: `eq.${programme}`,
        'companies.sector': `in.(${sectors.join(',')})`,
      })
    ),
    simplytkDataAsOf(),
  ]);

  const seen = new Set();
  const openings = [];
  for (const row of [...byDivision, ...bySector]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    openings.push({
      id: `simplytk:${row.id}`,
      company: row.companies?.name || 'Unknown',
      role: row.title,
      location: simplytkLocation(row),
      categories: row.division ? [row.division] : [],
      url: row.apply_url || null,
      sources: ['SimplyTK'],
      open: true,
      openingDate: (row.source_posted_at || row.first_seen_at || '').slice(0, 10) || null,
      closingDate: row.deadline ? row.deadline.slice(0, 10) : null,
      postedAt: (row.first_seen_at || '').slice(0, 10) || null,
    });
  }
  return { openings, dataAsOf };
}

// city and location overlap ("London" / "London, United Kingdom"), so only
// join them when they actually say different things.
function simplytkLocation(row) {
  const city = (row.city || '').trim();
  const location = (row.location || '').trim();
  if (!city) return location;
  if (!location) return city;
  return location.toLowerCase().includes(city.toLowerCase()) ? location : `${city} · ${location}`;
}

// ------------------------------------------------------- GitHub tracker repos
// Works with SimplifyJobs-style repos: tries the machine-readable
// listings.json first, then falls back to parsing the README table.
async function fetchGithubRepo(repoUrl) {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/);
  if (!match) throw new Error('Not a GitHub repo URL');
  const [, owner, repo] = match;

  for (const branch of ['dev', 'main', 'master']) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.github/scripts/listings.json`;
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return parseListingsJson(await res.json(), repo);
  }
  for (const branch of ['main', 'master', 'dev']) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return parseReadmeTable(await res.text(), repo);
  }
  throw new Error('No listings.json or README found');
}

function parseListingsJson(items, repo) {
  return items
    .filter((item) => item.active !== false && item.url)
    .map((item) => ({
      id: `gh:${item.id || hash(item.url)}`,
      company: item.company_name,
      role: item.title,
      location: (item.locations || []).join(', '),
      categories: item.category ? [item.category] : [],
      url: item.url,
      sources: [repo],
      open: true,
      postedAt: item.date_posted ? new Date(item.date_posted * 1000).toISOString().slice(0, 10) : null,
    }))
    .reverse(); // newest first
}

function parseReadmeTable(markdown, repo) {
  const openings = [];
  let lastCompany = '';
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3 || /^[-: ]+$/.test(cells[0]) || /company/i.test(cells[0])) continue;

    let company = stripMarkup(cells[0]);
    if (/^↳/.test(cells[0]) || !company) company = lastCompany;
    else lastCompany = company;

    const link = line.match(/href="(https?:[^"]+)"/)?.[1] || line.match(/\((https?:[^)]+)\)/)?.[1];
    if (!company || !link || /closed/i.test(line)) continue;
    openings.push({
      id: `gh:${hash(link)}`,
      company,
      role: stripMarkup(cells[1]),
      location: stripMarkup(cells[2] || ''),
      url: link,
      sources: [repo],
      open: true,
    });
  }
  return openings;
}

function stripMarkup(text) {
  return text.replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*/g, '').trim();
}

function repoName(url) {
  return url.match(/github\.com\/[^/]+\/([^/#?]+)/)?.[1] || 'GitHub repo';
}

// ------------------------------------------------------------------- merging
// The same internship appears in several sources under different titles
// ("2027 Software Engineer Program - Summer Internship" vs "Software
// Engineering Intern, 2027"), so matching on company+role catches almost none
// of them. We match on the normalised apply URL first — much the strongest
// signal — then fall back to a fuzzy title match within the same company.
const TRACKING_PARAMS = /^(utm_|gh_src$|src$|source$|ref$|referrer$|fbclid$|gclid$|mc_|trk$|_ga$|campaign)/i;

function normaliseUrl(raw) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // Workday links carry the posting id in the last path segment; the tenant,
  // locale and search state around it differ between sources.
  if (/(?:^|\.)myworkday(?:jobs|site)\.com$/i.test(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const id = last.slice(last.lastIndexOf('_') + 1);
    if (last.includes('_') && /\d/.test(id)) return `workday/${id.toLowerCase()}`;
  }

  const query = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return `${host}${url.pathname.replace(/\/+$/, '')}${query ? `?${query}` : ''}`;
}

// "J.P. Morgan" and "JPMorgan" are the same employer.
function normaliseCompany(name) {
  return String(name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

// Words every summer-internship title carries. They cannot tell two roles apart.
const ROLE_NOISE = new Set([
  'internship', 'intern', 'summer', 'placement', 'programme', 'program', 'scheme',
  'uk', 'united', 'kingdom', 'student', 'undergraduate', 'graduate', 'the', 'and', 'for',
]);

// Crude but symmetric: "engineering" and "engineer" both land on "engine".
function stem(word) {
  let out = word;
  if (out.length > 5 && out.endsWith('ing')) out = out.slice(0, -3);
  if (out.length > 4 && out.endsWith('ers')) out = out.slice(0, -3);
  else if (out.length > 3 && out.endsWith('er')) out = out.slice(0, -2);
  else if (out.length > 3 && out.endsWith('s')) out = out.slice(0, -1);
  return out;
}

function roleTokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/20\d\d/g, ' ')
      .split(/[^a-z]+/)
      .filter((word) => word.length > 1 && !ROLE_NOISE.has(word))
      .map(stem)
  );
}

// Titles that boil down to a single word ("2027 Summer Analyst Programme" is
// just {analyst}) are far too weak to merge on — Goldman Sachs alone runs
// several. Those only ever merge when their apply links agree.
function similarity(a, b) {
  if (a.size < 2 || b.size < 2) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

// Deliberately strict: 0.7 keeps "Software Engineer Intern" and "Software
// Engineer Intern - Infrastructure" apart while still merging the wording
// differences between sources.
const TITLE_MATCH = 0.7;

// Openings cached before multi-source merging carry a single `source` string.
function sourcesOf(opening) {
  if (opening.sources?.length) return opening.sources;
  return opening.source ? [opening.source] : [];
}

function mergeOpenings(results) {
  const byCompany = new Map();
  const merged = [];

  for (const result of results) {
    for (const raw of result.openings) {
      const opening = { ...raw, sources: [...sourcesOf(raw)] };
      const company = normaliseCompany(opening.company);
      const urlKey = normaliseUrl(opening.url);
      const tokens = roleTokens(opening.role);
      const bucket = byCompany.get(company) || [];

      const match = bucket.find(
        (existing) =>
          (urlKey && existing._urlKey === urlKey) ||
          similarity(existing._tokens, tokens) >= TITLE_MATCH
      );
      if (match) {
        absorb(match, opening);
        continue;
      }

      const entry = { ...opening, _urlKey: urlKey, _tokens: tokens };
      bucket.push(entry);
      byCompany.set(company, bucket);
      merged.push(entry);
    }
  }

  // Strip the matching scratch fields before any of this reaches the store.
  return merged.map(({ _urlKey, _tokens, ...opening }) => opening);
}

// A later source records that it also carries the opening and fills in blanks,
// but never overwrites: the first source to report a field wins, and Trackr
// runs first because its data is the richest.
function absorb(target, extra) {
  for (const source of extra.sources || []) {
    if (!target.sources.includes(source)) target.sources.push(source);
  }
  for (const field of ['location', 'url', 'openingDate', 'closingDate', 'postedAt', 'stagesHint']) {
    const current = target[field];
    if (current === null || current === undefined || current === '') {
      target[field] = extra[field] ?? current;
    }
  }
  target.categories = [...new Set([...(target.categories || []), ...(extra.categories || [])])];
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

module.exports = { refreshAll };
