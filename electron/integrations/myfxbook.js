// Pulls daily P/L from Myfxbook (myfxbook.com) — a free service that
// watches an MT4 account from the broker's side, so it works even when
// MT4 only exists on the phone. Uses their public JSON API.
// The Myfxbook password is stored encrypted with Windows DPAPI.
const { safeStorage } = require('electron');
const store = require('./../store');
const { importCutoff } = require('./mt4-live');

const API = 'https://www.myfxbook.com/api';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

function configure(email, password) {
  const canEncrypt = safeStorage.isEncryptionAvailable();
  const stored = canEncrypt
    ? safeStorage.encryptString(password).toString('base64')
    : Buffer.from(password, 'utf8').toString('base64');
  store.save('secrets', { myfxbook: { email, password: stored, encrypted: canEncrypt } });
}

function credentials() {
  const saved = store.load('secrets', {})?.myfxbook;
  if (!saved?.email) return null;
  const buffer = Buffer.from(saved.password, 'base64');
  return {
    email: saved.email,
    password: saved.encrypted ? safeStorage.decryptString(buffer) : buffer.toString('utf8'),
  };
}

function status() {
  const saved = store.load('secrets', {})?.myfxbook;
  return { configured: !!saved?.email, email: saved?.email || null };
}

async function call(path, params) {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Myfxbook responded ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.message || 'Myfxbook error');
  return data;
}

async function login() {
  const creds = credentials();
  if (!creds) throw new Error('Not set up yet — add your Myfxbook login in Settings');
  const data = await call('login.json', { email: creds.email, password: creds.password });
  return data.session;
}

function logout(session) {
  fetch(`${API}/logout.json?session=${encodeURIComponent(session)}`, { headers: HEADERS }).catch(() => {});
}

// Saves credentials, then proves they work and lists the connected accounts.
async function configureAndTest(email, password) {
  configure(email, password);
  const session = await login();
  try {
    const data = await call('get-my-accounts.json', { session });
    return {
      accounts: (data.accounts || []).map((a) => ({
        id: a.id,
        name: a.name,
        accountId: a.accountId,
      })),
    };
  } finally {
    logout(session);
  }
}

// Fetches the full daily-profit history and merges it into the trading store.
async function sync(preferredAccountId) {
  const session = await login();
  try {
    const data = await call('get-my-accounts.json', { session });
    const accounts = data.accounts || [];
    if (accounts.length === 0) {
      throw new Error('No trading account connected to your Myfxbook profile yet');
    }
    const account =
      accounts.find((a) => String(a.id) === String(preferredAccountId)) || accounts[0];

    const today = new Date().toISOString().slice(0, 10);
    const daily = await call('get-data-daily.json', {
      session,
      id: account.id,
      start: '2000-01-01',
      end: today,
    });

    // dataDaily is an array of day-arrays; each row has date "MM/dd/yyyy" and profit.
    const cutoff = importCutoff();
    const perDay = {};
    for (const row of (daily.dataDaily || []).flat()) {
      const iso = usDateToISO(row.date);
      if (!iso || row.profit == null) continue;
      if (cutoff && iso < cutoff) continue;
      perDay[iso] = (perDay[iso] || 0) + Number(row.profit);
    }

    const trading = store.load('trading', {});
    trading.days = trading.days || {};
    trading.goals = trading.goals || {};

    let total = 0;
    const dates = [];
    for (const [iso, profit] of Object.entries(perDay)) {
      if (Math.abs(profit) < 0.005) continue; // skip no-trade days
      trading.days[iso] = Math.round(profit * 100) / 100;
      total += profit;
      dates.push(iso);
    }
    dates.sort();
    trading.lastMyfxbookSync = new Date().toISOString();
    store.save('trading', trading);

    return {
      account: account.name,
      days: dates.length,
      from: dates[0] || null,
      to: dates[dates.length - 1] || null,
      total: Math.round(total * 100) / 100,
    };
  } finally {
    logout(session);
  }
}

function usDateToISO(text) {
  const match = String(text).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

module.exports = { configureAndTest, status, sync };
