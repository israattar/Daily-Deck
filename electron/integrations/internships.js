// Pulls internship openings from every configured source and merges them
// into one deduplicated list. Sources: The Trackr API and GitHub tracker
// repos (SimplifyJobs-style).

const HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' };

async function refreshAll(sources = {}) {
  const jobs = [];

  if (sources.trackr?.enabled !== false) {
    jobs.push(runSource('The Trackr', () => fetchTrackr(sources.trackr || {})));
  }
  for (const repoUrl of sources.githubRepos || []) {
    if (repoUrl.trim()) jobs.push(runSource(repoName(repoUrl), () => fetchGithubRepo(repoUrl)));
  }

  const results = await Promise.all(jobs);

  // Dedupe by company+role; earlier sources win (Trackr has the richest data).
  const seen = new Set();
  const openings = [];
  for (const result of results) {
    for (const opening of result.openings) {
      const key = `${opening.company}|${opening.role}`.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      openings.push(opening);
    }
  }

  return {
    openings,
    sourceStatus: results.map(({ openings: o, ...status }) => ({ ...status, count: o.length })),
    refreshedAt: new Date().toISOString(),
  };
}

async function runSource(name, fetcher) {
  try {
    return { name, ok: true, openings: await fetcher() };
  } catch (err) {
    return { name, ok: false, error: err.message, openings: [] };
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
          source: 'The Trackr',
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
      source: repo,
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
      source: repo,
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

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

module.exports = { refreshAll };
