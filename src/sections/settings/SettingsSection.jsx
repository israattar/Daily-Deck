// Settings — where every integration is wired up: health live-sync,
// internship sources, iCloud calendar links, and the GoWish share link.
import React from 'react';
import { useStore } from '../../api';
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

function replaceAt(list, index, value) {
  return list.map((item, i) => (i === index ? value : item));
}
