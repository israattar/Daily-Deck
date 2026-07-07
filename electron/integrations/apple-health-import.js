// Imports the full history from an Apple Health export (export.xml).
// On iPhone: Health app → profile picture → "Export All Health Data",
// then unzip and pick export.xml here. Files can be huge, so we stream
// line by line instead of loading the whole XML into memory.
const fs = require('fs');
const readline = require('readline');
const store = require('./../store');

async function importFile(filePath) {
  const health = store.load('health', {});
  health.steps = health.steps || {};
  health.sleep = health.sleep || {};
  health.cycle = health.cycle || { days: {} };

  // Steps arrive from both the watch and the phone; summing both would
  // double-count. Track them separately and prefer the watch per day.
  const stepsWatch = {};
  const stepsOther = {};
  const sleepByNight = {};
  let cycleDays = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.includes('<Record')) continue;

    if (line.includes('HKQuantityTypeIdentifierStepCount')) {
      const date = attr(line, 'startDate')?.slice(0, 10);
      const value = parseFloat(attr(line, 'value'));
      if (!date || !value) continue;
      const isWatch = (attr(line, 'sourceName') || '').includes('Watch');
      const bucket = isWatch ? stepsWatch : stepsOther;
      bucket[date] = (bucket[date] || 0) + value;
    } else if (line.includes('HKCategoryTypeIdentifierSleepAnalysis')) {
      const value = attr(line, 'value') || '';
      if (!value.includes('Asleep')) continue; // skip InBed / Awake rows
      const start = new Date(attr(line, 'startDate'));
      const end = new Date(attr(line, 'endDate'));
      const date = attr(line, 'endDate')?.slice(0, 10);
      const hours = (end - start) / 3600000;
      if (!date || !(hours > 0)) continue;
      const night = (sleepByNight[date] = sleepByNight[date] || { hours: 0, deep: 0, rem: 0, core: 0 });
      night.hours += hours;
      if (value.includes('Deep')) night.deep += hours;
      else if (value.includes('REM')) night.rem += hours;
      else night.core += hours;
    } else if (line.includes('HKCategoryTypeIdentifierMenstrualFlow')) {
      const date = attr(line, 'startDate')?.slice(0, 10);
      if (!date) continue;
      const value = attr(line, 'value') || '';
      const flow = value.replace('HKCategoryValueVaginalBleeding', '').replace('HKCategoryValueMenstrualFlow', '') || 'logged';
      health.cycle.days[date] = flow.toLowerCase() || 'logged';
      cycleDays++;
    }
  }

  for (const [date, value] of Object.entries(stepsOther)) {
    health.steps[date] = Math.round(value);
  }
  for (const [date, value] of Object.entries(stepsWatch)) {
    health.steps[date] = Math.round(value); // watch wins when both exist
  }
  for (const [date, night] of Object.entries(sleepByNight)) {
    health.sleep[date] = {
      hours: round1(night.hours),
      deep: round1(night.deep),
      rem: round1(night.rem),
      core: round1(night.core),
    };
  }

  health.lastSync = new Date().toISOString();
  store.save('health', health);

  return {
    stepsDays: Object.keys(stepsWatch).length + Object.keys(stepsOther).length,
    sleepNights: Object.keys(sleepByNight).length,
    cycleDays,
  };
}

function attr(line, name) {
  const match = line.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = { importFile };
