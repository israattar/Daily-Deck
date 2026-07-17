// Claude usage — two data sources:
//  1. Local transcripts (~/.claude/projects/**/*.jsonl) — Israa's own usage
//     on this PC: tokens per model, active minutes, sessions, estimated cost.
//  2. Manual readings of Claude Code's /usage panel. There is no public API
//     for the plan-limit percentages (the obvious oauth endpoint 403s), so
//     she types the numbers in. Each reading is stored with her measured
//     cost at that moment, which calibrates the hidden caps: the highest
//     ever cost-per-percent ratio is a lower bound on the real cap, so
//     estimates only get better with more readings.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./../store');

// USD per million tokens (input / output). Cache reads bill at 0.1x input,
// cache writes at 1.25x (5-minute) or 2x (1-hour). First regex match wins.
const PRICING = [
  { match: /fable|mythos/, input: 10, output: 50 },
  { match: /opus-4-[01]\b|opus-3/, input: 15, output: 75 },
  { match: /opus/, input: 5, output: 25 },
  { match: /sonnet/, input: 3, output: 15 },
  { match: /haiku-3-5/, input: 0.8, output: 4 },
  { match: /haiku-3/, input: 0.25, output: 1.25 },
  { match: /haiku/, input: 1, output: 5 },
];

const WINDOW_MS = 5 * 60 * 60 * 1000; // Claude's rolling session window

// The weekly limit resets Sunday 3:00 PM local (shown in Claude's /usage panel).
function lastWeeklyReset(nowMs) {
  const d = new Date(nowMs);
  d.setHours(15, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  if (d.getTime() > nowMs) d.setDate(d.getDate() - 7);
  return d.getTime();
}

function priceFor(model) {
  return PRICING.find((p) => p.match.test(model)) || { input: 5, output: 25 };
}

function costOf(model, use) {
  const p = priceFor(model);
  return (
    (use.in * p.input +
      use.out * p.output +
      use.cacheRead * p.input * 0.1 +
      use.cache5m * p.input * 1.25 +
      use.cache1h * p.input * 2) /
    1e6
  );
}

function isRealPrompt(message) {
  const content = message && message.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && !content.some((b) => b.type === 'tool_result');
}

function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Scan every transcript and aggregate per local day. Full rescan each call —
// a few MB of JSONL parses in well under a second.
function analyze() {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const resetMs = lastWeeklyReset(Date.now());
  const days = {}; // date -> { models, sessions:Set, userMsgs }
  const weekModels = {}; // model -> usage since the weekly reset
  const minutesByDay = {}; // date -> Set of epoch minutes (dedupes across files)
  const seen = new Set(); // message.id:requestId — streaming/forks duplicate lines
  const stamps = []; // { t, cost } per reply, for the 5h-window simulation
  let files = 0;

  const dayFor = (date) => (days[date] = days[date] || { models: {}, sessions: new Set(), userMsgs: 0 });
  const addUse = (acc, model, use) => {
    const m = (acc[model] = acc[model] || { in: 0, out: 0, cacheRead: 0, cache5m: 0, cache1h: 0, msgs: 0 });
    m.in += use.in; m.out += use.out; m.cacheRead += use.cacheRead;
    m.cache5m += use.cache5m; m.cache1h += use.cache1h;
    m.msgs++;
  };

  const empty = {
    days: {}, week: { since: new Date(resetMs).toISOString(), cost: 0, models: {} },
    currentWindow: null, files: 0, refreshedAt: new Date().toISOString(),
  };

  let projects = [];
  try {
    projects = fs.readdirSync(projectsDir);
  } catch {
    return empty;
  }

  for (const proj of projects) {
    const projDir = path.join(projectsDir, proj);
    let names = [];
    try {
      names = fs.readdirSync(projDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const name of names) {
      files++;
      let text;
      try {
        text = fs.readFileSync(path.join(projDir, name), 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        if (!line) continue;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        const t = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
        if (isNaN(t)) continue;
        const date = localDate(t);

        // Any timestamped user/assistant activity counts toward active time.
        if (entry.type === 'user' || entry.type === 'assistant') {
          (minutesByDay[date] = minutesByDay[date] || new Set()).add(Math.floor(t / 60000));
          if (entry.sessionId) dayFor(date).sessions.add(entry.sessionId);
          // "Prompts" = messages she typed. Tool results also arrive as
          // user entries (content blocks of type tool_result) — skip those.
          if (entry.type === 'user' && !entry.isSidechain && isRealPrompt(entry.message)) {
            dayFor(date).userMsgs++;
          }
        }

        if (entry.type !== 'assistant') continue;
        const msg = entry.message || {};
        const usage = msg.usage;
        const model = msg.model;
        if (!usage || !model || model.startsWith('<')) continue;
        const key = `${msg.id || entry.uuid}:${entry.requestId || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const cc = usage.cache_creation;
        const use = {
          in: usage.input_tokens || 0,
          out: usage.output_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          cache5m: cc ? cc.ephemeral_5m_input_tokens || 0 : usage.cache_creation_input_tokens || 0,
          cache1h: cc ? cc.ephemeral_1h_input_tokens || 0 : 0,
        };
        addUse(dayFor(date).models, model, use);
        if (t >= resetMs) addUse(weekModels, model, use);
        stamps.push({ t, cost: costOf(model, use) });
      }
    }
  }

  // Reconstruct 5-hour session windows from this PC's activity: a window
  // opens (on the hour) at the first message after the previous one lapsed.
  stamps.sort((a, b) => a.t - b.t);
  let win = null;
  for (const s of stamps) {
    if (!win || s.t >= win.start + WINDOW_MS) {
      const d = new Date(s.t);
      d.setMinutes(0, 0, 0);
      win = { start: d.getTime(), msgs: 0, minutes: new Set(), cost: 0 };
    }
    win.msgs++;
    win.minutes.add(Math.floor(s.t / 60000));
    win.cost += s.cost;
  }

  // Serialise: Sets -> counts/arrays, add per-day cost.
  const out = {};
  for (const [date, day] of Object.entries(days)) {
    const models = {};
    for (const [model, use] of Object.entries(day.models)) {
      models[model] = { ...use, cost: costOf(model, use) };
    }
    out[date] = {
      models,
      sessions: [...day.sessions],
      userMsgs: day.userMsgs,
      minutes: (minutesByDay[date] || new Set()).size,
    };
  }

  // Her usage since the weekly reset, per model — the honest half of the
  // "which model ate the weekly limit" question.
  let weekCost = 0;
  const weekOut = {};
  for (const [model, use] of Object.entries(weekModels)) {
    const cost = costOf(model, use);
    weekOut[model] = { ...use, cost };
    weekCost += cost;
  }

  return {
    days: out,
    week: { since: new Date(resetMs).toISOString(), cost: weekCost, models: weekOut },
    currentWindow: win && Date.now() < win.start + WINDOW_MS
      ? {
          start: new Date(win.start).toISOString(),
          end: new Date(win.start + WINDOW_MS).toISOString(),
          msgs: win.msgs,
          minutes: win.minutes.size,
          cost: win.cost,
        }
      : null,
    files,
    refreshedAt: new Date().toISOString(),
  };
}

// ---- Manual /usage readings + cap calibration ----

function loadSnapshots() {
  return (store.load('claude-limits-log', {}) || {}).snapshots || [];
}

// Each reading pairs the panel's percentages with her measured cost at that
// moment. Her cost can never exceed the whole account's, so cost/percent is
// always a lower bound on the true cap — the max across readings is the best
// (most conservative) estimate, and it improves every time she logs.
function capEstimates(snapshots) {
  let capSession = null;
  let capWeek = null;
  for (const s of snapshots) {
    if (s.session >= 5 && s.sessCost > 0.5) {
      capSession = Math.max(capSession || 0, s.sessCost / (s.session / 100));
    }
    if (s.week >= 3 && s.weekCost > 1) {
      capWeek = Math.max(capWeek || 0, s.weekCost / (s.week / 100));
    }
  }
  return { capSession, capWeek };
}

function getSnapshots() {
  const snapshots = loadSnapshots();
  return { snapshots, caps: capEstimates(snapshots) };
}

// Save a reading typed from Claude Code's /usage panel. Values are percents
// (0–100); any of them may be blank.
function logReading(reading = {}) {
  const pct = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const entry = {
    t: Date.now(),
    session: pct(reading.session),
    week: pct(reading.week),
    weekModel: pct(reading.weekModel),
  };
  if (entry.session == null && entry.week == null && entry.weekModel == null) {
    throw new Error('Enter at least one percentage from /usage');
  }

  const a = analyze(); // her measured cost right now, for calibration
  entry.sessCost = a.currentWindow ? a.currentWindow.cost : 0;
  entry.weekCost = a.week.cost;

  const snapshots = loadSnapshots();
  snapshots.push(entry);
  while (snapshots.length > 500) snapshots.shift();
  store.save('claude-limits-log', { snapshots });
  return { snapshots, caps: capEstimates(snapshots) };
}

module.exports = { analyze, getSnapshots, logReading };
