// Settings — where every integration is wired up: health live-sync,
// internship sources, iCloud calendar links, Myfxbook and GoWish.
import React, { useEffect, useState } from 'react';
import { deck, isDesktop, useStore } from '../../api';
import { DEFAULT_SETTINGS } from '../../lib/defaults';
import { SectionHead, Field, Chip } from '../../components/ui';

export default function SettingsSection() {
  const [stored, setStored] = useStore('settings', DEFAULT_SETTINGS);

  if (!stored) return null;

  // Merge defaults so new options appear even for old saved files.
  const settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    healthWebhook: { ...DEFAULT_SETTINGS.healthWebhook, ...stored.healthWebhook },
    internshipSources: {
      ...DEFAULT_SETTINGS.internshipSources,
      ...stored.internshipSources,
      trackr: { ...DEFAULT_SETTINGS.internshipSources.trackr, ...stored.internshipSources?.trackr },
      brightNetwork: { ...DEFAULT_SETTINGS.internshipSources.brightNetwork, ...stored.internshipSources?.brightNetwork },
    },
    gowish: { ...DEFAULT_SETTINGS.gowish, ...stored.gowish },
    myfxbook: { ...DEFAULT_SETTINGS.myfxbook, ...stored.myfxbook },
    trading: { ...DEFAULT_SETTINGS.trading, ...stored.trading },
  };

  const save = (patch) => setStored({ ...settings, ...patch });
  const trackr = settings.internshipSources.trackr;
  const brightNetwork = settings.internshipSources.brightNetwork;

  return (
    <div style={{ maxWidth: 760 }}>
      <SectionHead title="Settings" sub="Data lives on this laptop, in your user folder — nothing leaves it except the syncs you set up here." />

      <div className="card mb">
        <h3>🍎 Health — live Apple Watch sync</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Install <b>Health Auto Export</b> on your iPhone and point a REST API automation at this
          laptop (full walkthrough in the README). Then your steps, sleep and cycle update on their own.
        </p>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <Field label="Live sync">
            <select
              value={settings.healthWebhook.enabled ? 'on' : 'off'}
              onChange={(e) => save({ healthWebhook: { ...settings.healthWebhook, enabled: e.target.value === 'on' } })}
            >
              <option value="off">Off</option>
              <option value="on">On — listen for pushes</option>
            </select>
          </Field>
          <Field label="Port">
            <input
              type="number"
              style={{ width: 90 }}
              value={settings.healthWebhook.port}
              onChange={(e) => save({ healthWebhook: { ...settings.healthWebhook, port: Number(e.target.value) || 5599 } })}
            />
          </Field>
          {settings.healthWebhook.enabled && <Chip tone="green">phone should POST to http://&lt;laptop-ip&gt;:{settings.healthWebhook.port}/health</Chip>}
        </div>
      </div>

      <div className="card mb">
        <h3>🎓 Internship sources</h3>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <Field label="The Trackr">
            <select
              value={trackr.enabled ? 'on' : 'off'}
              onChange={(e) => save({ internshipSources: { ...settings.internshipSources, trackr: { ...trackr, enabled: e.target.value === 'on' } } })}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </Field>
          <Field label="Region">
            <select value={trackr.region} onChange={(e) => save({ internshipSources: { ...settings.internshipSources, trackr: { ...trackr, region: e.target.value } } })}>
              {['UK', 'US', 'EU', 'France', 'Germany', 'Italy', 'Hong Kong'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Industry">
            <select value={trackr.industry} onChange={(e) => save({ internshipSources: { ...settings.internshipSources, trackr: { ...trackr, industry: e.target.value } } })}>
              {['Tech', 'Finance', 'Law'].map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Season (blank = auto)">
            <input
              style={{ width: 90 }}
              placeholder="auto"
              value={trackr.seasons?.[0] || ''}
              onChange={(e) => save({ internshipSources: { ...settings.internshipSources, trackr: { ...trackr, seasons: e.target.value ? [e.target.value] : [] } } })}
            />
          </Field>
        </div>

        <Field label="GitHub tracker repos — one URL per line (SimplifyJobs-style repos work best)">
          <textarea
            placeholder={'https://github.com/SimplifyJobs/Summer2026-Internships\nhttps://github.com/...'}
            value={(settings.internshipSources.githubRepos || []).join('\n')}
            onChange={(e) =>
              save({ internshipSources: { ...settings.internshipSources, githubRepos: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })
            }
          />
        </Field>

        <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'flex-end' }}>
          <Field label="Bright Network (experimental — scraped from their site)">
            <select
              value={brightNetwork.enabled ? 'on' : 'off'}
              onChange={(e) => save({ internshipSources: { ...settings.internshipSources, brightNetwork: { ...brightNetwork, enabled: e.target.value === 'on' } } })}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </Field>
          <Field label="Search URL (optional — paste a brightnetwork.co.uk search you like)">
            <input
              style={{ width: 340 }}
              value={brightNetwork.url}
              onChange={(e) => save({ internshipSources: { ...settings.internshipSources, brightNetwork: { ...brightNetwork, url: e.target.value } } })}
            />
          </Field>
        </div>
      </div>

      <div className="card mb">
        <h3>📅 Apple / iCloud calendars</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          On iPhone: Calendar → tap your calendar → Public Calendar → copy the link (webcal://…) and paste it here.
          Repeat for each calendar you want to see.
        </p>
        {(settings.icsCalendars || []).map((cal, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Name"
              style={{ width: 130 }}
              value={cal.name}
              onChange={(e) => save({ icsCalendars: replaceAt(settings.icsCalendars, i, { ...cal, name: e.target.value }) })}
            />
            <input
              placeholder="webcal://p123-caldav.icloud.com/published/…"
              style={{ flex: 1 }}
              value={cal.url}
              onChange={(e) => save({ icsCalendars: replaceAt(settings.icsCalendars, i, { ...cal, url: e.target.value }) })}
            />
            <input
              type="color"
              value={cal.color || '#8b7cf7'}
              style={{ width: 42, padding: 2 }}
              onChange={(e) => save({ icsCalendars: replaceAt(settings.icsCalendars, i, { ...cal, color: e.target.value }) })}
            />
            <button className="btn small danger" onClick={() => save({ icsCalendars: settings.icsCalendars.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn small" onClick={() => save({ icsCalendars: [...(settings.icsCalendars || []), { name: '', url: '', color: '#8b7cf7' }] })}>
          + Add calendar
        </button>
      </div>

      <div className="card mb">
        <h3>📈 Trading imports</h3>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <Field label="Ignore trades before">
            <input
              type="date"
              value={settings.trading.importFrom}
              onChange={(e) => save({ trading: { ...settings.trading, importFrom: e.target.value } })}
            />
          </Field>
          <p className="faint" style={{ paddingBottom: 8 }}>
            Applies to MT4 sync, statement imports and Myfxbook. Leave empty to import
            everything. Days you log by hand are never filtered.
          </p>
        </div>
        <Field label="MT4 program path (auto-detected — only set this if opening MT4 fails)">
          <input
            placeholder="C:\Program Files (x86)\FPMarkets MT4 Terminal\terminal.exe"
            value={settings.trading.mt4Path || ''}
            onChange={(e) => save({ trading: { ...settings.trading, mt4Path: e.target.value } })}
          />
        </Field>
      </div>

      <MyfxbookCard
        accountId={settings.myfxbook.accountId}
        onAccountId={(accountId) => save({ myfxbook: { accountId } })}
      />

      <div className="card mb">
        <h3>🎁 GoWish</h3>
        <Field label="Share link of your wishlist (GoWish app → wishlist → Share)">
          <input
            placeholder="https://gowish.com/wishlist/…"
            value={settings.gowish.shareUrl}
            onChange={(e) => save({ gowish: { shareUrl: e.target.value } })}
          />
        </Field>
      </div>

      <p className="faint">
        Your data files live in <code>%APPDATA%\daily-deck\data</code> — back that folder up and you can never lose anything.
      </p>
    </div>
  );
}

// Myfxbook login lives in its own encrypted store, so this card talks to
// the main process directly instead of the normal settings file.
function MyfxbookCard({ accountId, onAccountId }) {
  const [state, setState] = useState({ configured: false, email: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDesktop) deck.invoke('myfxbook:status').then(setState).catch(() => {});
  }, []);

  async function saveAndTest() {
    setBusy(true);
    setMessage('');
    try {
      const result = await deck.invoke('myfxbook:configure', { email: email.trim(), password });
      setAccounts(result.accounts);
      setState({ configured: true, email: email.trim() });
      setPassword('');
      setMessage(
        result.accounts.length === 0
          ? 'Login works, but no trading account is connected on Myfxbook yet — add one there first.'
          : `Connected — found ${result.accounts.length} account${result.accounts.length > 1 ? 's' : ''}. Now hit “Sync Myfxbook” in the Trading section.`
      );
      if (result.accounts.length === 1) onAccountId(String(result.accounts[0].id));
    } catch (err) {
      setMessage(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="card mb">
      <h3>📈 Trading — Myfxbook sync</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Myfxbook watches your MT4 account from the broker's side (works with phone-only MT4).
        Create a free account at myfxbook.com, connect your MT4 account there, then enter your
        <b> Myfxbook login</b> here. The password is stored encrypted on this laptop only.
      </p>
      {state.configured && (
        <p className="muted" style={{ marginBottom: 10 }}>
          <Chip tone="green">connected as {state.email}</Chip>
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Myfxbook email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={state.email || 'you@email.com'} />
        </Field>
        <Field label="Myfxbook password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn primary" onClick={saveAndTest} disabled={busy || !email.trim() || !password}>
          {busy ? 'Testing…' : 'Save & test'}
        </button>
      </div>
      {accounts.length > 1 && (
        <Field label="Which account to sync">
          <select value={accountId} onChange={(e) => onAccountId(e.target.value)} style={{ marginTop: 8 }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} (#{a.accountId})</option>
            ))}
          </select>
        </Field>
      )}
      {message && <p className="muted" style={{ marginTop: 10 }}>{message}</p>}
    </div>
  );
}

function replaceAt(list, index, value) {
  return list.map((item, i) => (i === index ? value : item));
}
