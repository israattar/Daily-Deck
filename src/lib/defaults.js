// Default settings for a fresh install. Everything is editable in Settings.
export const DEFAULT_SETTINGS = {
  healthWebhook: { enabled: false, port: 5599 },
  internshipSources: {
    trackr: { enabled: true, region: 'UK', industry: 'Tech', seasons: [], types: ['summer-internships'] },
    brightNetwork: { enabled: false, url: '' },
    githubRepos: [],
  },
  icsCalendars: [],
  gowish: { shareUrl: '' },
};

export const DEFAULT_STAGES = ['Applied', 'CV screening', 'Online assessment', 'Interview', 'Offer'];
