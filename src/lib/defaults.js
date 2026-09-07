// Default settings for a fresh install. Everything is editable in Settings.
export const DEFAULT_SETTINGS = {
  healthWebhook: { enabled: false, port: 5599 },
  internshipSources: {
    trackr: { enabled: true, region: 'UK', industry: 'Tech', seasons: [], types: ['summer-internships'] },
    // "Tech" spans both the role's division and the company's sector, so a
    // software job at a bank and any job at Google both count.
    simplytk: {
      enabled: true,
      programmeType: 'summer_internship',
      divisions: ['Software Engineering'],
      sectors: ['tech'],
    },
    githubRepos: [],
  },
  icsCalendars: [],
  myfxbook: { accountId: '' },
  trading: { importFrom: '', mt4Path: '' },
};

export const DEFAULT_STAGES = ['Applied', 'CV screening', 'Online assessment', 'Interview', 'Offer'];

// Passcode to open the Trading section. Not a secret — just a soft lock so
// trading data isn't on show at a glance. Change it here.
export const TRADING_PASSCODE = '2004';
