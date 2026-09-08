# Daily Deck 🟣

Your personal daily lifestyle planner — a desktop app that lives on this laptop.
Six dashboards in one place: **Health · Academics · Calendar · Trading · Messages · Wishlist**.

All of your data is stored locally in `%APPDATA%\daily-deck\data` as plain JSON files.
Close the app, reboot, come back in three months — everything is still there.
(Back that one folder up and you can never lose anything.)

## Opening the app

Double-click **Daily Deck** on your Desktop (or search "Daily Deck" in the Start Menu —
right-click → *Pin to taskbar* if you want it there). Clicking it again while it's
open just focuses the existing window.

## The sections

| Section | What it does |
|---|---|
| 💜 Health | Sleep (with stages), steps analytics (daily / weekly / monthly / full history), menstrual cycle tracking with phase + next-period prediction |
| 🎓 Academics | New internship openings (aggregated + de-duplicated from The Trackr, SimplyTK and GitHub repos), application tracker with per-company stage pipelines, uni assignments with countdowns + grades, LeetCode habit calendar |
| 📅 Calendar | Your iCloud calendars + plans with friends, month view + upcoming list |
| 📈 Trading | Green/red P&L calendar (hover a day for the amount), monthly totals, history by month, editable monthly goal with progress bar |
| 🌙 Prayer | Sunni prayer times (Jeddah · Manchester · London via the AlAdhan API), current prayer with live countdown, Hijri date, favourite-ayah carousel |
| 📰 News | Your front page from public RSS (World · Middle East · Tech & AI · UK · Science · Astronomy). Each section pairs named mastheads — Guardian, Al Jazeera, WIRED, Arab News, NASA, ESA… — with a **Google News query that brings in whoever else is covering the story today**, so it is never stuck with a fixed list. Read stories dim, and **☆ saves a story to Favourites to read later** — saved stories keep their own copy, so they stay put after a refresh drops them |
| 💬 Messages | "Reply to this person" reminders, split by Snapchat / Instagram / WhatsApp / Email |
| 🎁 Wishlist | Synced from your GoWish share link (best effort) + manual items, wishlist vs bought |

---

## Connecting your data

### 🍎 Apple Watch health data (steps, sleep, cycle)

Windows can't talk to Apple Health directly, so Daily Deck supports two routes —
use both:

**1. Full history (one-off, do this first)**
On your iPhone: **Health app → your profile picture → Export All Health Data**.
AirDrop/send the zip to the laptop, unzip it, then in Daily Deck:
**Health → Import Apple Health export** and pick `export.xml`.
This loads your entire steps / sleep / cycle history.

**2. Live automatic updates (set-and-forget)** — two options, both need
**Settings → Health → Live sync: On** (allow the Windows Firewall prompt) and
phone + laptop on the same Wi-Fi. Test from the phone first: open
`http://<laptop-ip>:5599` in Safari — it should say "Daily Deck is listening."

**Option A — free, via Apple Shortcuts.** Build a shortcut that reads Health
and calls a URL (no third-party app needed):

1. Shortcuts app → **+** → name it "Daily Deck sync".
2. **Find Health Samples** — Type: *Steps*, filter *Start Date is in Today*.
3. **Calculate Statistics** — *Sum* of the Health Samples from step 2.
4. **Find Health Samples** again — Type: *Sleep*, filter *End Date is in Today*
   (and *Value is Asleep* if the filter is offered).
5. **Calculate Statistics** — *Sum*; tap the input variable and pick the
   samples' **Duration** property (minutes).
6. **URL** action: `http://<laptop-ip>:5599/health?steps=X&sleepMin=Y`
   where X and Y are the magic variables from steps 3 and 5.
7. **Get Contents of URL** (GET is the default). Run it once manually and
   allow the Health + local-network permission prompts.
8. Automations tab → **+** → *Time of Day* → daily, **Run Immediately** →
   run "Daily Deck sync". Add a second one in the evening so the day's
   step count gets topped up.

The endpoint is forgiving: `steps`, `sleepMin` (or `sleepHours`), `flow`
(period day) and `date` (defaults to today) in any combination.
Shortcuts can't read cycle data — log period days in the Health section
(one tap) instead.

**Option B — richer data, via [Health Auto Export](https://apps.apple.com/app/id1115567069)**
(automations are a paid feature; gives you sleep *stages*, not just totals):
create an **Automation** → type **REST API** → URL `http://<laptop-ip>:5599/health`,
format **JSON**, method **POST**, metrics: Steps, Sleep Analysis, Menstrual Flow,
schedule hourly. Tap "run now" to test.

If sync ever stops working, your laptop's IP probably changed — run
`ipconfig`, check the IPv4 address, and update the URL in the shortcut/app.

### 📅 Apple / iCloud calendar

For each calendar you want to see:
iPhone **Calendar app → Calendars → ⓘ next to a calendar → Public Calendar → Share Link**.
Paste the `webcal://…` link into **Settings → Apple / iCloud calendars** with a name and colour.

### ☁️ The always-on half (Cloudflare Worker)

The laptop only fetches while it is switched on, so news and internships stop
updating the moment the lid closes. `worker/` runs the **same fetchers** on
Cloudflare's schedule and keeps the results in KV, so your phone has current
data whether or not the laptop is on. It is free — no card required.

MT4, Apple Health and the Claude usage reader need files on the laptop and stay
there; the Worker only handles news and internships.

**One-time setup**

```bash
npx wrangler login                       # opens the browser
npx wrangler kv namespace create DECK    # prints an id
# paste that id into wrangler.toml
npx wrangler secret put DECK_TOKEN       # invent a long random string
npx wrangler deploy
```

For local testing, put `DECK_TOKEN=anything` in `.dev.vars` (gitignored) and run
`npx wrangler dev --test-scheduled`.

**Endpoints** (all need `Authorization: Bearer <token>` or `?k=<token>`)

| | |
|---|---|
| `GET /api/ping` | health check |
| `GET /api/store/<name>` | read a collection (`news-cache`, `internships`) |
| `PUT /api/store/<name>` | write one — lets the phone save a skip while the laptop is off |
| `POST /api/refresh?what=news\|internships\|all` | force a run without waiting for a cron |

**Why the schedule looks odd.** Cloudflare's free plan allows exactly 3 cron
triggers and gives each run **10 ms of CPU**. Parsing all 29 news feeds measures
~12.5 ms, so the news refresh is split into three topic slices of ~3 ms,
staggered ten minutes apart; each slice rewrites only its own topics and carries
the rest across. Internships costs under a millisecond, so rather than spend a
fourth trigger it rides along with the first slice at 06:00, 12:00 and 18:00.

### 📰 News sources

Each section is a **mix of two kinds of feed**, set in `electron/integrations/news.js`:

- **Named outlets** — Guardian, Al Jazeera, WIRED, Arab News, Saudi Gazette, TechCrunch,
  The Next Web, NASA, ESA, Space.com, Spaceflight Now, Universe Today, Astronomy.com,
  Phys.org, Ars Technica. Read straight from each publication's own RSS, so these cards
  carry a photo and a real summary.
- **A Google News query per section** — returns whoever is covering that subject *right now*
  (40–60 different outlets in a single query, and a different set tomorrow). These have no
  artwork and no summary, so they render as text cards with the publisher named on the chip.

The per-topic cap balances by **feed, not publisher** — otherwise a Google query's sixty
one-story outlets would each get the same share as the Guardian and bury it.

To add or drop an outlet, edit the `FEEDS` array. One caveat: the parser reads RSS
(`<item>`) only — an **Atom feed (`<entry>`) yields zero stories with no error**, so check a
new feed actually returns something.

### 🎓 Internship sources

- **The Trackr** — on by default (UK · Tech · current season, all changeable in Settings). Uses their public API.
- **SimplyTK** — on by default. UK-only live tracker; reads their Supabase endpoint directly,
  the same one their own site uses. Filtered to open summer internships that are either a
  Software Engineering role *or* at a tech-sector company, so software jobs at banks count
  too. Switch to tech companies only in Settings. Listings whose title names an earlier cycle
  ("2026 Software Dev Engineer Intern") are dropped — some stay flagged open upstream long
  after that cycle closed.
- **GitHub repos** — paste repo URLs (one per line) in Settings. SimplifyJobs-style trackers
  (with `listings.json`) work best; plain README-table repos are parsed too. *(This is where
  you add your two repos.)*

A company often runs several *different* internships — Jane Street lists six — so those stay
as separate rows, tagged **"2 other skipped here"** or **"1 other applied here"** to show you
have already dealt with that company without hiding a role you have not seen.

Openings carried by more than one tracker are listed **once**, with a chip for each source
that has them. Matching is by normalised apply URL first, then a fuzzy title match within the
same company — the sources word the same job differently ("2027 Software Engineer Program -
Summer Internship" vs "Software Engineering Intern, 2027").

Each source shows its own **fetched N min ago**, and SimplyTK also reports when *it* last
verified its listings — so a successful fetch of stale data still looks stale.

If a source is down or rate-limited, its openings are **kept from the last good refresh**
rather than disappearing, and its chip turns red explaining why. This matters for The Trackr
in particular: when you have hit its rate limit it replies `200 OK` with an empty list and a
`Retry-After` header, which would otherwise read as "there are no internships". Hammering
refresh is what triggers it, so if that chip goes red, just leave it a while.

Hit **↻ Refresh** in *Academics → New openings* to pull every source at once. Neither tracker
pushes new openings, so refreshing is manual and deliberate — which also keeps you well clear
of The Trackr's rate limit. For each opening: **✓ Applied** moves it into *My applications*
(with the company's real hiring stages pre-filled when The Trackr knows them), **✕ Skip** hides
it forever.

### 📈 MetaTrader 4

MT4 has no retail API, so Daily Deck supports two routes:

**Automatic — Myfxbook sync (works with MT4 on your phone only):**
1. Create a free account at **myfxbook.com**.
2. There: **Portfolio → Add Account → MetaTrader 4 (Auto update)**. You'll need your
   MT4 **account number**, your broker's **server name** (shown in the MT4 phone app
   under your account details, e.g. `Broker-Live04`), and your **investor password**
   (the read-only one — it's in the account email your broker sent you, or settable
   in your broker's client portal). Wait a few minutes for Myfxbook's first sync.
3. In Daily Deck: **Settings → Trading — Myfxbook sync** → enter your *Myfxbook*
   email + password → **Save & test**. The password is stored encrypted (Windows DPAPI).
4. **Trading → ↻ Sync Myfxbook** pulls your entire daily P/L history. Hit it whenever
   you want fresh numbers.

**Fully automatic & private — Expert Advisor (needs MT4 desktop, e.g. FP Markets):**
1. Install "MetaTrader 4 for Windows" from your broker's site and log in
   (account number + password from their welcome email, pick their Live server).
2. **Account History** tab → right-click → **All History** (otherwise MT4 only
   exposes the last 3 months).
3. MT4: **File → Open Data Folder → MQL4 → Experts** → copy
   `mt4\DailyDeckReporter.mq4` (from this project folder) in there → restart MT4.
4. Optional, for instant pushes: **Tools → Options → Expert Advisors** → tick
   *Allow WebRequest for listed URL* → add `http://127.0.0.1:5599`.
   (Skip it and syncing still works via a fallback file, within ~1 minute.)
5. Drag **DailyDeckReporter** from Navigator → Expert Advisors onto any chart → OK.
   The Experts tab should log "sent N days to Daily Deck". It re-syncs every
   5 minutes while MT4 is open, and never trades — it only reads history.

**Manual — statement import (needs MT4 desktop):** in MT4's **Account History**
tab → right-click → **Save as Report**, then **Trading → ⤓ Import MT4 report** and
pick the `.htm`. Every closed trade (profit + commission + swap) is summed into the
day it closed. All routes can be re-run any time — same dates just get updated,
and hand-logged days are only overwritten when the source covers those dates.

### 🎁 GoWish

In the GoWish app, share your wishlist and copy the link into **Settings → GoWish**,
then hit **↻ Sync GoWish** in the Wishlist section. GoWish has no public API so this
is best-effort scraping — if it can't read the page, add items manually (they're
never overwritten by a sync).

---

## For future you (or future Claude): the codebase

```
electron/                 main process (Node side)
  main.js                 window + app lifecycle
  preload.js              the safe window.deck bridge (only door to Node)
  store.js                one JSON file per collection in %APPDATA%\daily-deck\data
  ipc.js                  all request handlers
  integrations/           one file per external thing
    health-webhook.js     receives Health Auto Export pushes
    apple-health-import.js  parses export.xml (streamed)
    internships.js        The Trackr + SimplyTK + GitHub repos, merged and de-duplicated
    calendar.js           ICS fetch + recurring-event expansion

src/                      the UI (React)
  App.jsx                 sidebar + section switching
  api.js                  useStore() hook — how every section loads/saves data
  styles.css              the whole design system (colours at the top)
  components/             shared bits: MonthGrid, BarChart, Modal, chips…
  sections/               one folder per dashboard section
```

Dev commands:

```bash
npm run dev     # hot-reload dev mode (Vite + Electron + devtools)
npm run start   # build the UI then launch the app
npm run build   # rebuild the UI after changing src/ (the shortcut uses this build)
npm run dist    # optional: build a proper Windows installer into release/
```

**After editing anything in `src/`, run `npm run build` once** — the desktop
shortcut launches the built files, not the dev server.
