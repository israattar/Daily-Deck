// The UI's only door to stored data and integrations.
// In the desktop app this talks to Electron (window.deck).
// In a plain browser (preview) it falls back to localStorage so the UI still works.
import { useEffect, useRef, useState } from 'react';

const browserFallback = {
  load: async (name, fallback) => {
    try {
      const raw = localStorage.getItem(`deck:${name}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  save: async (name, data) => localStorage.setItem(`deck:${name}`, JSON.stringify(data)),
  invoke: async () => {
    throw new Error('Only available in the desktop app');
  },
  on: () => () => {},
};

// ---- Phone / remote mode -------------------------------------------------
// When the laptop serves this UI over the network it injects __DECK_REMOTE__.
// Everything then goes over HTTP to the same handlers the desktop uses, so the
// phone reads and writes the laptop's real store instead of its own island.
// The key arrives once in the URL (?k=...) and is kept in localStorage after.
const KEY_STORAGE = 'deck:remoteKey';

function remoteKey() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('k');
    if (fromUrl) {
      localStorage.setItem(KEY_STORAGE, fromUrl);
      // Drop the key from the address bar so it isn't kept in history.
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', clean);
      return fromUrl;
    }
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function makeRemote() {
  let key = remoteKey();

  async function call(channel, payload) {
    const res = await fetch('/api/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ channel, payload }),
    });
    if (res.status === 401) throw new Error('This device is not paired — reopen the link from Settings.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data.result;
  }

  return {
    hasKey: () => !!key,
    setKey: (value) => {
      key = value.trim().toUpperCase();
      localStorage.setItem(KEY_STORAGE, key);
    },
    load: (name, fallback) => call('store:load', { name, fallback }),
    save: (name, data) => call('store:save', { name, data }),
    invoke: (channel, payload) => call(channel, payload),
    on: () => () => {},
  };
}

// ---- Cloud mode ----------------------------------------------------------
// Built with VITE_WORKER_URL set (npm run build:cloud) and hosted on Cloudflare
// Pages, the UI talks to the Worker instead of to the laptop. That is the whole
// difference: the laptop can be shut, in a bag, or in another country.
//
// Deliberately separate from makeRemote(): that one is same-origin and
// upper-cases its key, because the laptop's pairing token is a 15-character
// A-Z2-9 code read off a screen. The Worker's token is a random string where
// case matters, so it must be left exactly as typed.
// VITE_CLOUD marks a build meant for Cloudflare. VITE_WORKER_URL is optional
// and normally left empty: empty means "same origin", so the app calls the
// Pages Function next to it rather than the Worker on another domain. That
// matters — a cross-site call to workers.dev was being blocked outright on the
// phone, with nothing arriving at Cloudflare at all. Same-origin has no CORS,
// no preflight, and nothing a content blocker treats as third-party.
const CLOUD_BUILD = import.meta.env.VITE_CLOUD === '1';
const WORKER_URL = (import.meta.env.VITE_WORKER_URL || '').replace(/\/+$/, '');

function makeCloud() {
  let key = remoteKey();

  async function call(channel, payload) {
    // Deliberately a CORS "simple request": POST, Content-Type text/plain, and
    // no custom headers. Anything else — an Authorization header, or a JSON
    // content type — makes the browser send an OPTIONS preflight first.
    //
    // That bit us badly: an early deploy answered the preflight without
    // Access-Control-Allow-Methods, Safari cached the refusal, and from then on
    // it silently declined to send anything. The phone showed "Load failed" and
    // the Worker logs stayed empty, because the request never left the device.
    // Keeping the request simple means there is no preflight to get wrong and
    // nothing for a browser to cache against us. The token rides in the body,
    // which — unlike a query string — is not written to server logs.
    const res = await fetch(`${WORKER_URL}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ token: key, channel, payload }),
    });
    if (res.status === 401) {
      // A wrong key used to persist anyway and then sit there silently failing
      // every call. Forget it, so the next load asks again instead of showing
      // a working-looking app with nothing in it.
      clearKey();
      throw new Error('This device is not paired — check the key.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data.result;
  }

  function clearKey() {
    key = '';
    try {
      localStorage.removeItem(KEY_STORAGE);
    } catch { /* private mode */ }
  }

  return {
    hasKey: () => !!key,
    clearKey,
    // Only used once the key has actually been proved to work.
    setKey: (value) => {
      key = value.trim(); // case-sensitive, unlike the laptop's pairing code
      localStorage.setItem(KEY_STORAGE, key);
    },
    // Try a key without committing it, so a typo cannot get saved.
    tryKey: async (value) => {
      key = value.trim();
      await call('store:load', { name: 'settings', fallback: {} });
      localStorage.setItem(KEY_STORAGE, key);
    },
    load: (name, fallback) => call('store:load', { name, fallback }),
    save: (name, data) => call('store:save', { name, data }),
    invoke: (channel, payload) => call(channel, payload),
    on: () => () => {},
  };
}

export const isRemote = typeof window !== 'undefined' && !!window.__DECK_REMOTE__;

// Cloud mode only applies when this is not the desktop app and the build was
// given a Worker to talk to.
export const isCloud =
  typeof window !== 'undefined' && !window.deck && !isRemote && CLOUD_BUILD;

export const remote = isRemote ? makeRemote() : isCloud ? makeCloud() : null;

export const deck =
  typeof window !== 'undefined' && window.deck
    ? window.deck
    : isRemote || isCloud
      ? remote
      : browserFallback;

export const isDesktop = typeof window !== 'undefined' && !!window.deck;

// Anywhere real data is available: the desktop app, a phone paired to the
// laptop, or a phone talking to the Worker.
export const isLive = isDesktop || isRemote || isCloud;

// Failures used to go nowhere: a section just drew empty and you could not tell
// "nothing stored" from "the request died". Anything that fails to reach the
// store announces itself here so the app can say so out loud.
export function reportError(message) {
  try {
    window.dispatchEvent(new CustomEvent('deck:error', { detail: message }));
  } catch { /* no window */ }
}

// React hook for one stored collection: const [data, setData] = useStore('trading', {...});
// setData updates the UI and persists to disk in one call.
export function useStore(name, fallback) {
  const [data, setDataState] = useState(null);
  // The newest value, updated synchronously. React state lags by a render,
  // so anything doing read-modify-write (skip an opening, tick a stage) would
  // otherwise build on a stale copy and silently undo the previous change.
  const latest = useRef(null);

  useEffect(() => {
    let alive = true;
    deck
      .load(name, fallback)
      .then((value) => {
        if (!alive) return;
        const resolved = value ?? fallback;
        latest.current = resolved;
        setDataState(resolved);
      })
      .catch((err) => {
        // Without this the promise rejected, `data` stayed null forever, and
        // every section rendered blank with nothing said anywhere — which is
        // indistinguishable from "you have no data". Fall back to the empty
        // default so the UI at least draws, and say so once in the console.
        console.error(`Could not load "${name}":`, err.message);
        reportError(`Could not load ${name} — ${err.message}`);
        if (!alive) return;
        latest.current = fallback;
        setDataState(fallback);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Accepts a value or an updater: setData(prev => ({ ...prev, x })).
  // Prefer the updater whenever the new value depends on the old one.
  const setData = (next) => {
    const value = typeof next === 'function' ? next(latest.current) : next;
    latest.current = value;
    setDataState(value);
    deck.save(name, value);
    return value;
  };

  return [data, setData];
}

export function openLink(url) {
  if (!url) return;
  if (isDesktop) deck.invoke('shell:open', url);
  else window.open(url, '_blank');
}
