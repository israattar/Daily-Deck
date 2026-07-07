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
| 🎓 Academics | New internship openings (aggregated from The Trackr, GitHub repos, Bright Network), application tracker with per-company stage pipelines, uni assignments with countdowns + grades, LeetCode habit calendar |
| 📅 Calendar | Your iCloud calendars + plans with friends, month view + upcoming list |
| 📈 Trading | Green/red P&L calendar (hover a day for the amount), monthly totals, history by month, editable monthly goal with progress bar |
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

**2. Live automatic updates (set-and-forget)**
1. In Daily Deck: **Settings → Health → Live sync: On**. If Windows Firewall asks, click **Allow** (private networks).
2. Find your laptop's IP: run `ipconfig` in a terminal and note the IPv4 address (e.g. `192.168.1.23`).
3. On your iPhone, install **[Health Auto Export](https://apps.apple.com/app/id1115567069)** (the JSON+CSV one).
4. In that app, create an **Automation** → type **REST API**:
   - URL: `http://192.168.1.23:5599/health` (your IP, your port)
   - Format: **JSON**, method **POST**
   - Metrics: Steps, Sleep Analysis, Menstrual Flow (add anything else you like)
   - Schedule: hourly or "when data changes"
5. Tap "run now" to test — the Health section updates instantly.

Phone and laptop must be on the same Wi-Fi. You can also open
`http://<laptop-ip>:5599` in the phone's browser to check the listener is up.

### 📅 Apple / iCloud calendar

For each calendar you want to see:
iPhone **Calendar app → Calendars → ⓘ next to a calendar → Public Calendar → Share Link**.
Paste the `webcal://…` link into **Settings → Apple / iCloud calendars** with a name and colour.

### 🎓 Internship sources

- **The Trackr** — on by default (UK · Tech · current season, all changeable in Settings). Uses their public API.
- **GitHub repos** — paste repo URLs (one per line) in Settings. SimplifyJobs-style trackers
  (with `listings.json`) work best; plain README-table repos are parsed too. *(This is where
  you add your two repos.)*
- **Bright Network** — experimental scrape of their search page; toggle it on in Settings.
  If they change their site it fails gracefully and shows a red chip.

Hit **↻ Refresh** in *Academics → New openings*. For each opening: **✓ Applied** moves it
into *My applications* (with the company's real hiring stages pre-filled when The Trackr
knows them), **✕ Skip** hides it forever.

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
    internships.js        The Trackr API + GitHub repos + Bright Network
    calendar.js           ICS fetch + recurring-event expansion
    gowish.js             GoWish share-page scrape
    scrape.js             hidden-window scraper used by the two above

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
