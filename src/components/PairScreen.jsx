// Shown on a phone that reached the laptop but has no key yet — normally
// only if the link was typed by hand rather than opened from Settings.
import React, { useState } from 'react';
import { remote } from '../api';

export default function PairScreen({ onPaired }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = key.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    remote.setKey(trimmed);
    try {
      await remote.invoke('store:load', { name: 'settings', fallback: {} });
      onPaired();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="pair-screen">
      <div className="pair-card">
        <div className="logo">DD</div>
        <h2>Daily Deck</h2>
        <p className="muted">
          Enter the pairing key from <b>Settings → Phone access</b> on your laptop.
        </p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="ABCDE-FGHJK-LMNPQ"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck="false"
        />
        <button className="btn primary" style={{ width: '100%', marginTop: 12 }}
          onClick={submit} disabled={busy || !key.trim()}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
        {error && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
