// Fills Daily Deck with realistic demo data so every dashboard has
// something to show. Run with:  node scripts/seed-demo.js
// Everything it writes lives in %APPDATA%\daily-deck\data — delete a file
// there (or just keep using the app) and the demo data is gone/replaced.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.env.APPDATA, 'daily-deck', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const save = (name, data) =>
  fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(data, null, 2));

const DAY = 86400000;
const toISO = (d) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const daysAgo = (n) => toISO(new Date(Date.now() - n * DAY));
const daysAhead = (n) => toISO(new Date(Date.now() + n * DAY));
const now = new Date().toISOString();

// Deterministic pseudo-random so re-running gives the same data.
let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------------------------------------------------------------- health
const steps = {};
const sleep = {};
for (let i = 0; i < 90; i++) {
  const iso = daysAgo(i);
  const weekend = [0, 6].includes(new Date(`${iso}T12:00`).getDay());
  steps[iso] = Math.round((weekend ? 6500 : 9000) + (rand() - 0.4) * 6000);
}
for (let i = 0; i < 45; i++) {
  const hours = Math.round((6.3 + rand() * 2.3) * 10) / 10;
  const deep = Math.round(hours * (0.13 + rand() * 0.05) * 10) / 10;
  const rem = Math.round(hours * (0.2 + rand() * 0.05) * 10) / 10;
  sleep[daysAgo(i)] = {
    hours,
    deep,
    rem,
    core: Math.round((hours - deep - rem) * 10) / 10,
    awake: Math.round(rand() * 0.5 * 10) / 10,
  };
}
// Three periods: two full past ones and one that started yesterday.
const cycleDays = {};
const logPeriod = (startDaysAgo, length, flows) => {
  for (let d = 0; d < length; d++) cycleDays[daysAgo(startDaysAgo - d)] = flows[Math.min(d, flows.length - 1)];
};
logPeriod(55, 5, ['medium', 'heavy', 'medium', 'light', 'light']);
logPeriod(27, 5, ['medium', 'heavy', 'medium', 'light', 'light']);
logPeriod(1, 2, ['medium', 'heavy']);
save('health', { steps, sleep, cycle: { days: cycleDays }, lastSync: now });

// ------------------------------------------------------------- academics
save('applications', [
  {
    id: 'demo:google', company: 'Google', role: 'STEP Intern 2027', url: 'https://careers.google.com',
    source: 'The Trackr', appliedAt: daysAgo(23),
    stages: ['Applied', 'Online assessments', 'Interview 1', 'Interview 2', 'Offer'],
    stageIndex: 2, status: 'active', notes: 'Referral from Sara — interviewer likes graph questions.',
  },
  {
    id: 'demo:bloomberg', company: 'Bloomberg', role: 'Software Engineering Intern', url: 'https://bloomberg.com/careers',
    source: 'The Trackr', appliedAt: daysAgo(12),
    stages: ['Applied', 'HackerRank', 'Phone interview', 'Final round', 'Offer'],
    stageIndex: 1, status: 'active', notes: 'HackerRank due Friday — practise stacks + queues.',
  },
  {
    id: 'demo:amazon', company: 'Amazon', role: 'SDE Intern', url: 'https://amazon.jobs',
    source: 'manual', appliedAt: daysAgo(40),
    stages: ['Applied', 'Online assessment', 'Assessment centre', 'Offer'],
    stageIndex: 3, status: 'offer', notes: 'Offer!! Deadline to respond: end of month.',
  },
  {
    id: 'demo:meta', company: 'Meta', role: 'SWE Intern', url: null,
    source: 'manual', appliedAt: daysAgo(35),
    stages: ['Applied', 'CV screening', 'Online assessment', 'Interview', 'Offer'],
    stageIndex: 1, status: 'rejected', notes: '',
  },
]);

save('assignments', [
  { id: 'demo:a1', module: 'COMP2011', title: 'Coursework 3 — SQL optimisation', dueDate: daysAhead(3), gradeDate: daysAhead(24), notes: 'Index the join on orders first, then explain the query plan.', submitted: false },
  { id: 'demo:a2', module: 'COMP2211', title: 'Group project — sprint 2 demo', dueDate: daysAhead(9), gradeDate: daysAhead(30), notes: 'My part: auth + the settings page.', submitted: false },
  { id: 'demo:a3', module: 'COMP2611', title: 'Search algorithms essay', dueDate: daysAhead(16), gradeDate: '', notes: '', submitted: false },
  { id: 'demo:a4', module: 'COMP2311', title: 'Packet analysis lab', dueDate: daysAgo(5), gradeDate: daysAhead(12), notes: '', submitted: true, submittedAt: daysAgo(5) },
  { id: 'demo:a5', module: 'COMP2011', title: 'Coursework 2 — ER modelling', dueDate: daysAgo(30), notes: '', submitted: true, submittedAt: daysAgo(30), grade: '78%', gradedAt: daysAgo(10) },
  { id: 'demo:a6', module: 'COMP1721', title: 'OOP exam', dueDate: daysAgo(60), notes: '', submitted: true, submittedAt: daysAgo(60), grade: '85%', gradedAt: daysAgo(38) },
]);

const leetcode = {};
const problems = ['1', '121', '217', '242', '20', '704', '733', '235', '110, 141', '21', '226', '104, 100', '53', '57'];
[0, 1, 2, 5, 7, 8, 11, 13, 16, 19, 22, 26, 30, 33].forEach((offset, i) => {
  leetcode[daysAgo(offset)] = { problems: problems[i], note: i === 0 ? 'Two pointers finally clicked' : '' };
});
save('leetcode', leetcode);

// -------------------------------------------------------------- calendar
save('plans', [
  { id: 'demo:p1', title: 'Study session', friends: 'Zara', date: daysAhead(3), time: '14:00', place: 'Library, floor 3' },
  { id: 'demo:p2', title: 'Cinema', friends: 'Sara & Amina', date: daysAhead(5), time: '19:30', place: 'Vue' },
  { id: 'demo:p3', title: 'Brunch', friends: 'Amina', date: daysAhead(7), time: '11:00', place: 'The Ivy' },
]);

const uniEvents = [
  [1, '10:00', 'Databases lecture', 'Roger Stevens LT'],
  [1, '17:30', 'Gym', ''],
  [2, '09:00', 'Software Eng lab', 'Bragg 2.05'],
  [4, '10:00', 'Databases lecture', 'Roger Stevens LT'],
  [4, '15:00', 'Careers: CV workshop', 'Careers centre'],
  [6, '17:30', 'Gym', ''],
  [8, '09:00', 'Software Eng lab', 'Bragg 2.05'],
  [10, '12:00', 'Society social', 'Union'],
];
save('calendar-cache', {
  fetchedAt: now,
  sourceStatus: [],
  events: uniEvents.map(([offset, time, title, location], i) => {
    const date = daysAhead(offset);
    return {
      id: `demo:ev${i}`, title, date, allDay: false, location,
      start: `${date}T${time}:00`, end: `${date}T${time}:00`,
      calendar: title === 'Gym' ? 'Personal' : 'Uni',
      color: title === 'Gym' ? '#3ddc97' : '#5b8cff',
    };
  }),
});

// --------------------------------------------------------------- trading
const tradingDays = {};
for (let i = 1; i <= 34; i++) {
  const iso = daysAgo(i);
  const day = new Date(`${iso}T12:00`).getDay();
  if (day === 0 || day === 6 || rand() < 0.25) continue; // no weekend trading, some days off
  const win = rand() < 0.62;
  tradingDays[iso] = Math.round((win ? 40 + rand() * 220 : -(30 + rand() * 160)) * 100) / 100;
}
tradingDays[daysAgo(0)] = 86.4;
const goalKey = daysAgo(0).slice(0, 7);
const lastMonthKey = daysAgo(34).slice(0, 7);
save('trading', { days: tradingDays, goals: { [lastMonthKey]: 400, [goalKey]: 500 } });

// -------------------------------------------------------------- messages
save('messages', [
  { id: 'demo:m1', app: 'snapchat', person: 'Maya', about: 'Reply about Saturday plans', addedAt: daysAgo(1) },
  { id: 'demo:m2', app: 'instagram', person: 'Zara', about: 'Asked for the lecture notes', addedAt: daysAgo(2) },
  { id: 'demo:m3', app: 'whatsapp', person: 'Mum', about: 'Call back about the weekend', addedAt: daysAgo(0) },
  { id: 'demo:m4', app: 'whatsapp', person: 'Uni group', about: 'Confirm presentation slot', addedAt: daysAgo(3) },
  { id: 'demo:m5', app: 'email', person: 'Careers advisor', about: 'Reply re CV review appointment', addedAt: daysAgo(4) },
]);

// -------------------------------------------------------------- wishlist
save('wishlist', {
  syncedAt: null,
  items: [
    { id: 'demo:w1', title: 'AirPods Pro 3', price: '£219', url: 'https://www.apple.com/uk/airpods-pro/', image: 'https://picsum.photos/seed/airpods/300/200', manual: true, bought: false },
    { id: 'demo:w2', title: 'Kindle Paperwhite', price: '£149', url: '', image: 'https://picsum.photos/seed/kindle/300/200', manual: true, bought: false },
    { id: 'demo:w3', title: 'Stanley Quencher 890ml', price: '£35', url: '', image: 'https://picsum.photos/seed/stanley/300/200', manual: true, bought: false },
    { id: 'demo:w4', title: 'Dyson Airwrap', price: '£480', url: '', image: 'https://picsum.photos/seed/dyson/300/200', manual: true, bought: false },
    { id: 'demo:w5', title: 'Nike Air Force 1', price: '£110', url: '', image: 'https://picsum.photos/seed/nike/300/200', manual: true, bought: true },
    { id: 'demo:w6', title: 'Sony WH-1000XM6', price: '£299', url: '', image: 'https://picsum.photos/seed/sony/300/200', manual: true, bought: true },
  ],
});

// --------------------------------------------- internships (real fetch!)
// The openings feed uses live data from The Trackr rather than fake entries.
const { refreshAll } = require('../electron/integrations/internships');
refreshAll({ trackr: { enabled: true } })
  .then((result) => {
    save('internships', {
      cache: result.openings,
      dismissed: {},
      sourceStatus: result.sourceStatus,
      lastRefresh: result.refreshedAt,
    });
    console.log(`Seeded all dashboards. Openings feed: ${result.openings.length} real internships from The Trackr.`);
  })
  .catch((err) => {
    save('internships', { cache: [], dismissed: {}, sourceStatus: [], lastRefresh: null });
    console.log(`Seeded all dashboards. (Trackr fetch skipped: ${err.message})`);
  });
