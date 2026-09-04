// The UI's only door to stored data and integrations.
// In the desktop app this talks to Electron (window.deck).
// In a plain browser (preview) it falls back to localStorage so the UI still works.
import { useEffect, useState } from 'react';

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

export const isRemote = typeof window !== 'undefined' && !!window.__DECK_REMOTE__;

export const remote = isRemote ? makeRemote() : null;

export const deck =
  typeof window !== 'undefined' && window.deck
    ? window.deck
    : isRemote
      ? remote
      : browserFallback;

export const isDesktop = typeof window !== 'undefined' && !!window.deck;

// True wherever real data is available — desktop app or paired phone.
export const isLive = isDesktop || isRemote;

// React hook for one stored collection: const [data, setData] = useStore('trading', {...});
// setData updates the UI and persists to disk in one call.
export function useStore(name, fallback) {
  const [data, setDataState] = useState(null);

  useEffect(() => {
    let alive = true;
    deck.load(name, fallback).then((value) => {
      if (alive) setDataState(value ?? fallback);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const setData = (next) => {
    setDataState(next);
    deck.save(name, next);
  };

  return [data, setData];
}

export function openLink(url) {
  if (!url) return;
  if (isDesktop) deck.invoke('shell:open', url);
  else window.open(url, '_blank');
}
