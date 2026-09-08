// Shown on a phone with no key yet — either paired to the laptop over the
// local network, or to the Cloudflare Worker, which works with the laptop off.
import React, { useState } from 'react';
import { remote, isCloud } from '../api';

export default function PairScreen({ onPaired }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    // The laptop's pairing code is a 15-character A-Z2-9 code read off a
    // screen, so it is case-insensitive. The Worker's token is random and
    // case-sensitive — upper-casing it would silently break every attempt.
    const trimmed = isCloud ? key.trim() : key.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      // Prove the key before storing it. Saving first meant a typo stuck
      // around, the pairing screen was skipped next time, and every request
      // failed silently behind an app that looked fine but held nothing.
      if (remote.tryKey) {
        await remote.tryKey(trimmed);
      } else {
        remote.setKey(trimmed);
        await remote.invoke('store:load', { name: 'settings', fallback: {} });
      }
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
          {isCloud
            ? 'Enter your Daily Deck access key. This connects to your own cloud copy, so your laptop does not need to be on.'
            : <>Enter the pairing key from <b>Settings → Phone access</b> on your laptop.</>}
        </p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={isCloud ? 'your access key' : 'ABCDE-FGHJK-LMNPQ'}
          autoCapitalize={isCloud ? 'none' : 'characters'}
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
