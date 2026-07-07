// Health — Apple Watch stats: sleep, steps (with full history), menstrual cycle.
// Data arrives three ways: live pushes from the Health Auto Export iPhone app,
// a full-history import of the Apple Health export file, and manual logging.
import React, { useEffect, useMemo, useState } from 'react';
import { deck, isDesktop, useStore } from '../../api';
import { SectionHead, Stat, Chip, Empty, Tabs } from '../../components/ui';
import BarChart from '../../components/BarChart';
import { fmtDate, todayISO, countdownLabel, urgency } from '../../lib/dates';
import * as hm from './healthMath';

const EMPTY_HEALTH = { steps: {}, sleep: {}, cycle: { days: {} }, lastSync: null };

export default function HealthSection() {
  const [health, setHealth] = useStore('health', EMPTY_HEALTH);
  const [range, setRange] = useState('Days');
  const [showHistory, setShowHistory] = useState(false);
  const [webhook, setWebhook] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  // Live updates: when the phone pushes new data, reload from disk.
  useEffect(() => {
    const off = deck.on('health:updated', () => {
      deck.load('health', EMPTY_HEALTH).then((fresh) => setHealth({ ...fresh }));
    });
    if (isDesktop) deck.invoke('health:webhookStatus').then(setWebhook).catch(() => {});
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = health?.steps || {};
  const sleep = health?.sleep || {};
  const cycle = useMemo(() => hm.cycleInfo(health?.cycle?.days), [health]);
  const lastNight = hm.latestSleep(sleep);

  const chartData =
    range === 'Days' ? hm.dailySteps(steps, 14)
    : range === 'Weeks' ? hm.weeklySteps(steps, 12)
    : hm.monthlySteps(steps, 12);

  async function importExport() {
    setImporting(true);
    try {
      const result = await deck.invoke('health:importExport');
      if (!result.canceled) {
        setMessage(`Imported ${result.stepsDays} days of steps, ${result.sleepNights} nights of sleep, ${result.cycleDays} cycle days.`);
        const fresh = await deck.load('health', EMPTY_HEALTH);
        setHealth({ ...fresh });
      }
    } catch (err) {
      setMessage(err.message);
    }
    setImporting(false);
  }

  function logPeriodDay(date, flow) {
    const next = { ...health, cycle: { days: { ...health.cycle?.days, [date]: flow } } };
    setHealth(next);
  }

  if (!health) return null;
  const historyDates = Object.keys(steps).sort().reverse();

  return (
    <div>
      <SectionHead title="Health" sub={health.lastSync ? `Last synced ${new Date(health.lastSync).toLocaleString('en-GB')}` : 'Not synced yet — import your Apple Health export to load history'}>
        <button className="btn" onClick={importExport} disabled={importing || !isDesktop}>
          {importing ? 'Importing…' : '⤓ Import Apple Health export'}
        </button>
      </SectionHead>

      {message && <p className="muted mb">{message}</p>}

      <div className="grid cols-4 mb">
        <Stat
          label="Sleep (last night)"
          value={lastNight ? `${Math.floor(lastNight.hours)}h ${Math.round((lastNight.hours % 1) * 60)}m` : '—'}
          hint={lastNight ? fmtDate(lastNight.date) : 'no data yet'}
        >
          {lastNight && lastNight.deep != null && (
            <div className="sleep-bar" title={`deep ${lastNight.deep}h · core ${lastNight.core}h · rem ${lastNight.rem}h`}>
              <span className="deep" style={{ flex: lastNight.deep || 0 }} />
              <span className="core" style={{ flex: lastNight.core || 0 }} />
              <span className="rem" style={{ flex: lastNight.rem || 0 }} />
              {lastNight.awake ? <span className="awake" style={{ flex: lastNight.awake }} /> : null}
            </div>
          )}
        </Stat>
        <Stat label="Steps today" value={(steps[todayISO()] || 0).toLocaleString()} hint={`7-day avg ${hm.averageSteps(steps, 7).toLocaleString()}`} />
        <Stat
          label="Cycle"
          value={cycle ? `Day ${cycle.cycleDay}` : '—'}
          hint={cycle ? `${cycle.phase} phase · avg cycle ${cycle.avgCycle}d` : 'log a period day below'}
        />
        <Stat
          label="Next period"
          value={cycle ? fmtDate(cycle.nextPeriod) : '—'}
          hint={cycle ? countdownLabel(cycle.nextPeriod, 'expected') : ''}
        />
      </div>

      <div className="card mb">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Steps</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <Tabs tabs={['Days', 'Weeks', 'Months']} active={range} onChange={setRange} />
            <button className="btn small ghost" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? 'Hide history' : 'Full history'}
            </button>
          </div>
        </div>
        <BarChart data={chartData} format={(v) => v.toLocaleString()} />
        {showHistory && (
          <div className="scroll-table" style={{ marginTop: 14 }}>
            {historyDates.length === 0 ? (
              <Empty icon="👟">No step history yet.</Empty>
            ) : (
              <table className="data">
                <thead><tr><th>Date</th><th>Steps</th><th>Sleep</th></tr></thead>
                <tbody>
                  {historyDates.map((iso) => (
                    <tr key={iso}>
                      <td>{fmtDate(iso)} <span className="faint">{iso}</span></td>
                      <td>{steps[iso].toLocaleString()}</td>
                      <td>{sleep[iso] ? `${sleep[iso].hours}h` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="grid cols-2 mb">
        <div className="card">
          <h3>Sleep — last 14 nights</h3>
          <BarChart data={hm.nightlySleep(sleep, 14)} format={(v) => `${v}h`} />
        </div>

        <CyclePanel cycle={cycle} onLog={logPeriodDay} />
      </div>

      <div className="card">
        <h3>Live sync from Apple Watch</h3>
        {webhook?.running ? (
          <p className="muted">
            <Chip tone="green">listening</Chip>&nbsp; Your iPhone can push updates to port {webhook.port}.
            {webhook.lastReceived && ` Last push: ${new Date(webhook.lastReceived).toLocaleString('en-GB')}.`}
          </p>
        ) : (
          <p className="muted">
            Live sync is off. Enable it in <b>Settings → Health</b>, then set up the free
            “Health Auto Export” app on your iPhone to push watch data automatically (guide in the README).
          </p>
        )}
      </div>
    </div>
  );
}

function CyclePanel({ cycle, onLog }) {
  const [date, setDate] = useState(todayISO());
  const [flow, setFlow] = useState('medium');

  return (
    <div className="card">
      <h3>Menstrual cycle</h3>
      {cycle ? (
        <>
          <p className="muted" style={{ marginBottom: 10 }}>
            <Chip tone="pink">{cycle.phase}</Chip>&nbsp; Day {cycle.cycleDay} of ~{cycle.avgCycle} ·
            next period <Chip tone={urgency(cycle.nextPeriod)}>{countdownLabel(cycle.nextPeriod, 'expected')}</Chip>
          </p>
          <div className="scroll-table" style={{ maxHeight: 130, marginBottom: 12 }}>
            {cycle.periods.slice().reverse().map((p) => (
              <div className="row" key={p.start}>
                <div className="grow">
                  <div className="title">{fmtDate(p.start)} → {fmtDate(p.end)}</div>
                  <div className="desc">{Math.max(1, 1 + Math.round((new Date(p.end) - new Date(p.start)) / 86400000))} days</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Empty icon="🌙">No cycle data yet — import your Apple Health export or log a day below.</Empty>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select value={flow} onChange={(e) => setFlow(e.target.value)}>
          <option value="light">Light</option>
          <option value="medium">Medium</option>
          <option value="heavy">Heavy</option>
        </select>
        <button className="btn" onClick={() => onLog(date, flow)}>Log period day</button>
      </div>
    </div>
  );
}
