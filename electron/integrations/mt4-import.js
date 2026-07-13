// Imports closed-trade history from a MetaTrader 4 statement.
// In MT4: Account History tab → right-click → "Save as Report"
// (or "Save as Detailed Report"), then pick the saved .htm file here.
// Each trade's net result (profit + commission + swap) is summed into
// the day it was CLOSED, matching how the trading calendar thinks.
const fs = require('fs');
const store = require('./../store');
const { importCutoff } = require('./mt4-live');

function importFile(filePath) {
  const html = fs.readFileSync(filePath, 'latin1'); // MT4 reports are not UTF-8
  const { totals, counts, stats } = parseStatement(html);

  const cutoff = importCutoff();
  if (cutoff) {
    for (const date of Object.keys(totals)) {
      if (date < cutoff) { delete totals[date]; delete counts[date]; delete stats[date]; }
    }
  }

  const dates = Object.keys(totals).sort();
  if (dates.length === 0) throw new Error('No closed trades found in that report');

  const trading = store.load('trading', {});
  trading.days = trading.days || {};
  trading.counts = trading.counts || {};
  trading.stats = trading.stats || {};
  trading.goals = trading.goals || {};

  let total = 0;
  for (const [date, value] of Object.entries(totals)) {
    trading.days[date] = Math.round(value * 100) / 100; // report is authoritative for its dates
    trading.counts[date] = counts[date];
    if (stats[date]) trading.stats[date] = stats[date];
    total += value;
  }
  store.save('trading', trading);

  return {
    days: dates.length,
    from: dates[0],
    to: dates[dates.length - 1],
    total: Math.round(total * 100) / 100,
  };
}

// Returns per-day net profit, trade count and stats for every day with a
// closed trade: { totals, counts, stats } where stats holds
// {n, w, l, hs, hws, hls} (trades, wins, losses, hold seconds).
function parseStatement(html) {
  const totals = {};
  const counts = {};
  const stats = {};
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cellText);
    if (cells.length < 10) continue;

    // Closed trades have type buy/sell. This skips balance/deposit lines
    // and cancelled pending orders ("buy limit", "cancelled", ...).
    const type = (cells[2] || '').toLowerCase().trim();
    if (type !== 'buy' && type !== 'sell') continue;

    // Standard layout: open time[1] ... close time[8], then the four
    // money columns commission/taxes/swap/profit. Fall back to "last
    // datetime + last number" for report variants.
    let openTime;
    let closeTime;
    let net;
    if (cells.length === 14 && isDateTime(cells[8])) {
      openTime = cells[1];
      closeTime = cells[8];
      net = num(cells[10]) + num(cells[11]) + num(cells[12]) + num(cells[13]);
    } else {
      const dateTimes = cells.filter(isDateTime);
      openTime = dateTimes[0];
      closeTime = dateTimes[dateTimes.length - 1];
      net = num(cells[cells.length - 1]);
    }
    if (!closeTime || !Number.isFinite(net)) continue;

    const date = closeTime.slice(0, 10).replace(/\./g, '-');
    totals[date] = (totals[date] || 0) + net;
    counts[date] = (counts[date] || 0) + 1;

    const day = (stats[date] = stats[date] || { n: 0, w: 0, l: 0, hs: 0, hws: 0, hls: 0 });
    day.n++;
    const held = holdSeconds(openTime, closeTime);
    day.hs += held;
    if (net > 0) { day.w++; day.hws += held; }
    if (net < 0) { day.l++; day.hls += held; }
  }
  return { totals, counts, stats };
}

function cellText(cell) {
  return cell
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function isDateTime(text) {
  return /^\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}/.test(text || '');
}

// "2026.07.01 09:15:00" → seconds between open and close.
function holdSeconds(open, close) {
  const parse = (t) => new Date(String(t).replace(/\./g, '-').replace(' ', 'T')).getTime();
  const ms = parse(close) - parse(open);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0;
}

// MT4 formats numbers like "1 234.56" or "-12.34".
function num(text) {
  const n = parseFloat(String(text).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

module.exports = { importFile, parseStatement };
