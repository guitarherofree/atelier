// Atelier configuration: app constants and the defaults for Settings.
// Most of this can be changed in Settings; colors live in src/renderer/theme.css.

const config = {
  appName: 'Atelier',
  bundleId: 'com.guitarherofree.atelier',

  updates: {
    owner: 'guitarherofree',
    repo: 'atelier',
    checkOnLaunchAfterSeconds: 10,
    // Release assets are named Atelier-<version>-mac-<arch>.zip
    assetPattern: (version, arch) => `Atelier-${version}-mac-${arch}.zip`,
  },

  fetching: {
    timeoutSeconds: 25,
    // Pause between two requests to the same website, to stay polite.
    perHostDelaySeconds: 1.5,
    maxPageBytes: 6 * 1024 * 1024,
    // A real browser's identity; some sites refuse unknown clients.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    renderWaitSeconds: 12,
  },

  geocoding: {
    endpoint: 'https://nominatim.openstreetmap.org/search',
    userAgent: 'Atelier/1.0 (private artist-career app; personal use)',
  },

  map: {
    tiles: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
  },
};

export const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  general: {
    // Re-check saved opportunities against their pages this often (days). 0 = never automatically.
    recheckEveryDays: 3,
    // A detail not re-checked for this long is flagged for you to verify.
    staleAfterDays: 14,
    // Look for new opportunities in your sources when Atelier opens, at most this often (hours). 0 = only when you ask.
    discoverEveryHours: 0,
    newPerSourceLimit: 25,
    notifyChanges: true,
    weekStartsOn: 0,
  },
  ai: {
    provider: 'off', // off | anthropic | ollama | openai
    anthropic: { model: 'claude-sonnet-5-5', webSearchTool: 'web_search_20250305' },
    ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3.1' },
    openai: { baseUrl: 'http://127.0.0.1:1234/v1', model: '' },
    consented: {},
  },
  search: {
    provider: 'browser', // browser | claude | brave
    engine: 'duckduckgo',
  },
  instagram: {
    mode: 'off', // off | browser | graph
    hashtags: ['artistresidency'],
    igUserId: '',
    apiVersion: 'v23.0',
  },
  map: {
    geocode: true,
  },
  calendar: {
    alarmsDaysBefore: [7, 1],
    defaultKinds: ['deadline', 'target', 'rec'],
  },
  updates: {
    checkAutomatically: true,
    checkEveryHours: 24,
  },
  backups: {
    auto: true,
    keep: 14,
    folder: null,
    includePortfolioFiles: false,
  },
  portfolio: {
    copyFiles: true,
  },
  appearance: {
    theme: 'system',
  },
};

export default config;
