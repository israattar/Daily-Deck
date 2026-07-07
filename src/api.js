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

export const deck = typeof window !== 'undefined' && window.deck ? window.deck : browserFallback;

export const isDesktop = typeof window !== 'undefined' && !!window.deck;

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
