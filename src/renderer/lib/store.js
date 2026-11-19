// Window state: a live copy of your data (kept in sync by the app process), navigation, and UI helpers.
import { signal, computed, batch } from '@preact/signals';
import { assessFit } from '../../shared/fit.mjs';

const api = window.atelier;

export const data = signal({
  profile: {}, settings: {}, opportunities: [], applications: [], sources: [], contacts: [], portfolio: [], projects: [], proposals: [], snippets: [],
});
export const meta = signal({ version: '', secrets: {}, secretLabels: {}, ai: { provider: 'off' }, map: {} });
export const discovery = signal({ running: false, sources: {} });
export const updates = signal({ state: 'idle' });
export const toasts = signal([]);
export const modal = signal(null);
export const ready = signal(false);

// ---------------------------------------------------------------- navigation

export const route = signal({ view: 'discover' });
const stack = [];

export function go(view, params = {}) {
  const next = { view, ...params };
  if (JSON.stringify(next) === JSON.stringify(route.value)) return;
  stack.push(route.value);
  if (stack.length > 60) stack.shift();
  route.value = next;
  persistUi();
  document.querySelector('.main-scroll')?.scrollTo(0, 0);
}

export function back() {
  const prev = stack.pop();
  if (prev) route.value = prev;
}

export function setRouteParams(params) {
  route.value = { ...route.value, ...params };
  persistUi();
}

let uiTimer;
function persistUi() {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => api.invoke('state:saveUi', { route: route.value, prefs: uiPrefs.value }), 500);
}

export const uiPrefs = signal({ hidePast: true, oppSort: 'deadline', discoverSort: 'fit' });
export function setUiPref(k, v) {
  uiPrefs.value = { ...uiPrefs.value, [k]: v };
  persistUi();
}

// ---------------------------------------------------------------- calls

export async function call(channel, ...args) {
  try {
    const r = await api.invoke(channel, ...args);
    if (r && typeof r === 'object' && !Array.isArray(r) && r.error && typeof r.error === 'string') toast(r.error, 'error');
    return r;
  } catch (err) {
    toast(err.message || String(err), 'error');
    return { error: err.message };
  }
}

export function confirmDialog(message, detail = '', { confirmLabel = 'OK', destructive = false } = {}) {
  return api.invoke('ui:confirm', { message, detail, confirmLabel, destructive });
}

let toastId = 0;
export function toast(message, kind = 'info', ms = kind === 'error' ? 7000 : 4000) {
  const id = ++toastId;
  toasts.value = [...toasts.value, { id, message, kind }].slice(-4);
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, ms);
}

export function openModal(type, props = {}) {
  modal.value = { type, props };
}
export function closeModal() {
  modal.value = null;
}

// ---------------------------------------------------------------- derived

export const byId = computed(() => {
  const d = data.value;
  const m = {};
  for (const k of ['opportunities', 'applications', 'contacts', 'portfolio', 'projects', 'proposals', 'snippets', 'sources']) {
    m[k] = new Map((d[k] || []).map((x) => [x.id, x]));
  }
  return m;
});

export const appByOpp = computed(() => new Map(data.value.applications.map((a) => [a.opportunityId, a])));

export const fitCtx = computed(() => {
  const kinds = new Set();
  for (const it of data.value.portfolio) for (const f of it.files || []) kinds.add(f.kind);
  for (const it of data.value.portfolio) if ((it.links || []).some((l) => /vimeo|youtube/.test(l.url))) kinds.add('video');
  for (const it of data.value.portfolio) if ((it.links || []).some((l) => /soundcloud|bandcamp|spotify/.test(l.url))) kinds.add('audio');
  return { contactsCount: data.value.contacts.length, portfolioKinds: kinds };
});

export const fits = computed(() => {
  const m = new Map();
  const p = data.value.profile;
  const ctx = fitCtx.value;
  for (const o of data.value.opportunities) m.set(o.id, assessFit(o, p, ctx));
  return m;
});

// ---------------------------------------------------------------- start-up

export async function init() {
  const r = await api.invoke('app:init');
  batch(() => {
    data.value = r.data;
    meta.value = { version: r.version, platform: r.platform, isPackaged: r.isPackaged, secrets: r.secrets, secretLabels: r.secretLabels, ai: r.ai, map: r.map, dataDir: r.dataDir, recovered: r.recovered, backups: r.backups, lastDiscoveryAt: r.lastDiscoveryAt };
    discovery.value = r.discovery || { running: false, sources: {} };
    updates.value = r.updateStatus || { state: 'idle' };
    if (r.ui?.route?.view && !['opportunity', 'application'].includes(r.ui.route.view)) route.value = r.ui.route;
    if (r.ui?.prefs) uiPrefs.value = { ...uiPrefs.value, ...r.ui.prefs };
    ready.value = true;
  });
  api.on('db:changed', (name, value) => { data.value = { ...data.value, [name]: value }; });
  api.on('discovery:progress', (s) => {
    const was = discovery.value.running;
    discovery.value = s;
    if (was && !s.running) meta.value = { ...meta.value, lastDiscoveryAt: s.finishedAt };
  });
  api.on('updates:status', (s) => { updates.value = s; });
  api.on('toast', (t) => toast(t.message, t.kind));
  api.on('ai:info', (info) => { meta.value = { ...meta.value, ai: info }; });
  api.on('browser:captured', (c) => toast(`${c.updated ? 'Updated' : 'Added to Discover'}: ${c.name}`, 'success'));
  if (r.recovered?.length) toast(`Some data files were unreadable and were restored from their previous copy: ${r.recovered.join(', ')}.`, 'error', 12000);
}

export async function refreshSecrets() {
  const s = await api.invoke('secrets:status');
  meta.value = { ...meta.value, secrets: s };
}

export { api };
