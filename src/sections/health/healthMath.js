// Pure calculations for the health section: step aggregations and
// menstrual-cycle maths. Kept out of the component so it is easy to read.
import { addDays, daysBetween, todayISO, weekStart } from '../../lib/dates';

// Last `n` days of steps as chart data (oldest → newest).
export function dailySteps(steps, n = 14) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const iso = addDays(todayISO(), -i);
    out.push({ label: iso.slice(8), value: steps[iso] || 0, tip: `${iso}: ${(steps[iso] || 0).toLocaleString()} steps` });
  }
  return out;
}

// Last `n` weeks (Mon–Sun totals).
export function weeklySteps(steps, n = 12) {
  const out = [];
  const thisWeek = weekStart(todayISO());
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    let total = 0;
    for (let d = 0; d < 7; d++) total += steps[addDays(start, d)] || 0;
    out.push({ label: start.slice(5), value: total, tip: `wk of ${start}: ${total.toLocaleString()} steps` });
  }
  return out;
}

// Last `n` calendar months.
export function monthlySteps(steps, n = 12) {
  const totals = {};
  for (const [iso, value] of Object.entries(steps)) totals[iso.slice(0, 7)] = (totals[iso.slice(0, 7)] || 0) + value;
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-GB', { month: 'short' });
    out.push({ label, value: totals[key] || 0, tip: `${key}: ${(totals[key] || 0).toLocaleString()} steps` });
  }
  return out;
}

export function averageSteps(steps, days = 7) {
  let total = 0;
  let counted = 0;
  for (let i = 0; i < days; i++) {
    const value = steps[addDays(todayISO(), -i)];
    if (value != null) { total += value; counted++; }
  }
  return counted ? Math.round(total / counted) : 0;
}

// Last `n` nights of sleep as chart data.
export function nightlySleep(sleep, n = 14) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const iso = addDays(todayISO(), -i);
    const hours = sleep[iso]?.hours || 0;
    out.push({ label: iso.slice(8), value: hours, tip: `${iso}: ${hours}h` });
  }
  return out;
}

// Most recent night with data (usually last night).
export function latestSleep(sleep) {
  const dates = Object.keys(sleep).sort();
  if (!dates.length) return null;
  const date = dates[dates.length - 1];
  return { date, ...sleep[date] };
}

// Group logged period days into periods, then derive cycle facts.
export function cycleInfo(cycleDays) {
  const dates = Object.keys(cycleDays || {}).sort();
  if (!dates.length) return null;

  const periods = [];
  let current = { start: dates[0], end: dates[0] };
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(current.end, dates[i]) <= 1) {
      current.end = dates[i];
    } else {
      periods.push(current);
      current = { start: dates[i], end: dates[i] };
    }
  }
  periods.push(current);

  // Average gap between the last few period starts (falls back to 28).
  const starts = periods.map((p) => p.start).slice(-6);
  let avgCycle = 28;
  if (starts.length >= 2) {
    const gaps = [];
    for (let i = 1; i < starts.length; i++) gaps.push(daysBetween(starts[i - 1], starts[i]));
    avgCycle = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const lastStart = periods[periods.length - 1].start;
  const cycleDay = daysBetween(lastStart, todayISO()) + 1;
  const nextPeriod = addDays(lastStart, avgCycle);

  let phase = 'Luteal';
  if (daysBetween(lastStart, todayISO()) <= daysBetween(lastStart, periods[periods.length - 1].end)) phase = 'Menstrual';
  else if (cycleDay <= 13) phase = 'Follicular';
  else if (cycleDay <= 16) phase = 'Ovulation';

  return { periods, avgCycle, cycleDay, nextPeriod, phase, lastStart };
}
