// Atelier — main process: data, discovery, files, updates, and the bridge to the window.
import { app, BrowserWindow, ipcMain, dialog, shell, screen, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import config from '../config.mjs';
import { Database } from './db.mjs';
import { Keychain, SECRETS } from './keychain.mjs';
import { Fetcher } from './net/fetcher.mjs';
import { Discovery } from './discovery/crawler.mjs';
import { Snapshots } from './discovery/snapshots.mjs';
import { Instagram } from './discovery/instagram.mjs';
import { runSearch, suggestedQueries } from './discovery/search.mjs';
import { defaultSources } from './discovery/sources.mjs';
import { setManualField, verifyField, acceptSiteValue, keepYourValue, revertChange, toFieldValue } from './opportunities.mjs';
import { Assistant } from './ai.mjs';
import { aiExtract, aiFit, aiTailor, aiDraftAnswer, aiShorten } from './aitasks.mjs';
import { Geocoder } from './geocode.mjs';
import { Backups } from './backup.mjs';
import { PortfolioFiles, kindOf } from './portfolio.mjs';
import { buildReview, exportPackage } from './submission.mjs';
import { buildIcs } from './ics.mjs';
import { Updater } from './updater.mjs';
import { AtelierBrowser } from './browser.mjs';
import { buildAppMenu } from './menu.mjs';
import { registerSchemes, handleSchemes } from './protocol.mjs';
import { sessionFetch, renderPage, makeThumb, htmlToPdf } from './electron-helpers.mjs';
import { calendarItems } from '../shared/calendar.mjs';
import { assessFit } from '../shared/fit.mjs';
import { OPP_FIELDS, oppName, MATERIAL_TYPES, uid, hostOf, todayISO, fieldText } from '../shared/schema.mjs';
import { getMeta, parseHtml } from './extract/html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName(config.appName);
if (process.env.ATELIER_USER_DATA) app.setPath('userData', path.resolve(process.env.ATELIER_USER_DATA));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

registerSchemes();

const userData = app.getPath('userData');
const dataDir = userData;
const logsDir = path.join(userData, 'Logs');
const activityLog = path.join(logsDir, 'activity.log');

let db; let keychain; let fetcher; let discovery; let snapshots; let assistant; let geocoder; let backups; let pf; let updater; let browser;
let win = null;
let quitting = false;

function log(kind, message) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const st = fs.existsSync(activityLog) ? fs.statSync(activityLog) : null;
    if (st && st.size > 2 * 1024 * 1024) fs.renameSync(activityLog, `${activityLog}.1`);
    fs.appendFileSync(activityLog, `${new Date().toISOString()} [${kind}] ${message}\n`);
  } catch {}
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function toast(message, kind = 'info') {
  send('toast', { message, kind });
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  } catch {}
  toast(`${title}: ${body}`);
}

async function confirm({ message, detail, confirmLabel = 'OK', destructive = false, cancelLabel = 'Cancel' }) {
  const { response } = await dialog.showMessageBox(win, {
    type: destructive ? 'warning' : 'question', buttons: [confirmLabel, cancelLabel], defaultId: 0, cancelId: 1, message, detail,
  });
  return response === 0;
}

function openExternal(url) {
  if (/^(https?:|mailto:)/i.test(String(url || ''))) shell.openExternal(url);
}

// ---------------------------------------------------------------- actions shared by menu and IPC

const actions = {
  discover: () => { discovery.run().catch((err) => log('discovery', err.message)); send('menu:command', 'navigate', 'discover'); },
  checkForUpdates: () => { send('menu:command', 'navigate', 'settings', 'updates'); updater.check({ manual: true }); },
  openBrowser: (url) => browser.open(url || 'https://duckduckgo.com/?q=artist+residency+open+call'),
  showData: () => shell.openPath(dataDir),
  showLog: () => { fs.mkdirSync(logsDir, { recursive: true }); if (!fs.existsSync(activityLog)) fs.writeFileSync(activityLog, ''); shell.openPath(activityLog); },
  async backupNow() {
    try {
      const r = await backups.create({});
      toast(`Backed up to ${path.basename(r.file)}`, 'success');
      return r;
    } catch (err) { toast(`Backup failed: ${err.message}`, 'error'); return { error: err.message }; }
  },
  async backupTo() {
    const res = await dialog.showSaveDialog(win, {
      title: 'Back Up Everything', buttonLabel: 'Back Up',
      defaultPath: path.join(app.getPath('documents'), `Atelier Backup ${new Date().toISOString().slice(0, 10)}.zip`),
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    try {
      const r = await backups.create({ dest: res.filePath.endsWith('.zip') ? res.filePath : `${res.filePath}.zip`, includeFiles: true });
      shell.showItemInFolder(r.file);
      return r;
    } catch (err) { toast(`Backup failed: ${err.message}`, 'error'); return { error: err.message }; }
  },
  async restore(file) {
    let target = file;
    if (!target) {
      const res = await dialog.showOpenDialog(win, { title: 'Restore from Backup', defaultPath: backups.folder, properties: ['openFile'], filters: [{ name: 'Atelier backup', extensions: ['zip'] }] });
      if (res.canceled || !res.filePaths.length) return { canceled: true };
      target = res.filePaths[0];
    }
    let manifest;
    try { manifest = await backups.inspect(target); } catch (err) { await dialog.showMessageBox(win, { type: 'error', message: 'Can’t restore that file', detail: err.message }); return { error: err.message }; }
    const c = manifest.counts || {};
    const ok = await confirm({
      message: `Restore the backup from ${new Date(manifest.createdAt).toLocaleString()}?`,
      detail: `It contains ${c.opportunities ?? '?'} opportunities, ${c.applications ?? '?'} applications, ${c.portfolio ?? '?'} portfolio items and ${c.proposals ?? '?'} proposals${manifest.includesPortfolioFiles ? ', with portfolio files' : ''}.\n\nYour current data will be replaced. Atelier saves a backup of it first, so you can undo this.`,
      confirmLabel: 'Restore', destructive: true,
    });
    if (!ok) return { canceled: true };
    try {
      const r = await backups.restore(target);
      toast('Backup restored. A copy of your previous data was saved first.', 'success');
      return r;
    } catch (err) { toast(`Restore failed: ${err.message}`, 'error'); return { error: err.message }; }
  },
  async exportData() {
    const res = await dialog.showOpenDialog(win, { title: 'Export Data', message: 'Choose where to put the export folder.', buttonLabel: 'Export Here', properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('documents') });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    const r = await backups.exportReadable(res.filePaths[0]);
    shell.openPath(r.dir);
    return r;
  },
};

// ---------------------------------------------------------------- window

function createWindow() {
  const saved = db.state.data.window;
  const bounds = { width: 1360, height: 880 };
  if (saved && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return saved.x >= a.x - 50 && saved.y >= a.y - 50 && saved.x < a.x + a.width && saved.y < a.y + a.height;
  })) Object.assign(bounds, { x: saved.x, y: saved.y, width: saved.width, height: saved.height });

  win = new BrowserWindow({
    ...bounds,
    minWidth: 1020,
    minHeight: 640,
    show: false,
    title: config.appName,
    backgroundColor: '#f4f1ea',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true,
    },
  });
  if (saved?.maximized) win.maximize();
  win.loadURL('atelier-app://app/index.html');
  win.once('ready-to-show', () => win.show());

  let boundsTimer;
  const remember = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      const maximized = win.isMaximized();
      const b = maximized ? (db.state.data.window || win.getNormalBounds()) : win.getBounds();
      db.state.data.window = { ...b, maximized };
      db.state.save();
    }, 400);
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', (e) => {
    if (!quitting && process.platform === 'darwin') { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('atelier-app://')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
}

// ---------------------------------------------------------------- helpers

const EDITABLE_OPP = new Set(['tags', 'notes', 'calendar', 'custom', 'geo', 'url', 'starred']);
const COLLECTIONS_RENDERER_CAN_EDIT = new Set(['contacts', 'snippets', 'proposals', 'projects', 'portfolio', 'applications', 'sources']);

function defaultMaterials(opp) {
  const req = opp.fields?.requirements?.value || [];
  const map = [
    ['CV / résumé', 'cv'], ['Artist statement', 'statement'], ['Bio', 'bio'], ['Project proposal', 'proposal'], ['Work samples', 'samples'],
    ['Budget', 'budget'], ['Recommendation letters', 'letters'], ['Letter of intent', 'letter-of-intent'], ['Timeline / work plan', 'timeline'],
  ];
  const out = [];
  for (const [label, type] of map) {
    if (req.includes(label)) out.push({ id: uid('m_'), type, label: MATERIAL_TYPES.find((t) => t.key === type)?.label || label, required: true, status: 'todo' });
  }
  if (!out.some((m) => m.type === 'samples') && opp.fields?.workSamples) out.push({ id: uid('m_'), type: 'samples', label: 'Work samples', required: true, status: 'todo' });
  if (!out.some((m) => m.type === 'letters') && /\d|one|two|three/i.test(fieldText('recommendations', opp.fields?.recommendations)) && !/not required/i.test(fieldText('recommendations', opp.fields?.recommendations))) {
    out.push({ id: uid('m_'), type: 'letters', label: 'Recommendation letters', required: true, status: 'todo' });
  }
  const fee = opp.fields?.applicationFee?.value;
  if (fee?.amount > 0) out.push({ id: uid('m_'), type: 'fee', label: `Application fee (${fieldText('applicationFee', opp.fields.applicationFee)})`, required: true, status: 'todo' });
  if (!out.length) {
    for (const type of ['cv', 'statement', 'proposal', 'samples']) out.push({ id: uid('m_'), type, label: MATERIAL_TYPES.find((t) => t.key === type).label, required: true, status: 'todo' });
  }
  return out;
}

async function needAiConsent(purpose) {
  const desc = assistant.describe();
  if (desc.provider === 'off') return { error: 'AI assistance is off. Turn it on in Settings › AI.' };
  const consented = db.settings.ai.consented?.[desc.provider];
  if (consented) return null;
  const ok = await confirm({
    message: desc.leavesMac ? `Send text to ${desc.label}?` : `Use ${desc.label}?`,
    detail: desc.leavesMac
      ? `To ${purpose}, Atelier sends only the text this action needs (for example the opportunity page and the parts of your profile it uses) to ${desc.destination}. Nothing else from your library is sent. Atelier will remember this choice for ${desc.label}; you can turn AI off any time in Settings › AI.`
      : `To ${purpose}, Atelier sends the needed text to ${desc.destination}, which runs on this Mac. Nothing leaves your computer.`,
    confirmLabel: 'Continue',
  });
  if (!ok) return { canceled: true };
  db.updateSettings({ ai: { consented: { [desc.provider]: new Date().toISOString() } } });
  return null;
}

function aiWrap(fn) {
  return async (...args) => {
    try { return await fn(...args); } catch (err) { log('ai', err.message); return { error: err.message }; }
  };
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, ...args) => {
    try { return await fn(...args); } catch (err) {
      log('ipc', `${channel}: ${err.stack || err.message}`);
      return { error: err.message || String(err) };
    }
  });

  handle('app:init', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    data: db.snapshot(),
    ui: db.state.data.ui,
    secrets: await keychain.status(),
    secretLabels: Object.fromEntries(Object.entries(SECRETS).map(([k, v]) => [k, v.label])),
    updateStatus: updater.status,
    discovery: discovery.state,
    lastDiscoveryAt: db.state.data.discovery?.lastRunAt || null,
    backups: { ...(db.state.data.backups || {}), folder: backups.folder },
    ai: assistant.describe(),
    recovered: db.recovered,
    dataDir,
    map: { tiles: config.map.tiles, attribution: config.map.attribution },
  }));
  handle('state:saveUi', (ui) => { db.state.data.ui = ui; db.state.save(); });
  handle('ui:confirm', (o) => confirm(o || {}));
  handle('shell:open', (url) => openExternal(url));
  handle('shell:showData', () => actions.showData());
  handle('log:show', () => actions.showLog());

  // profile, settings, secrets
  handle('profile:update', (patch) => db.updateProfile(patch));
  handle('profile:replace', (key, value) => { db.profileFile.data[key] = value; db.profileFile.save(); db.updateProfile({}); return db.profile; });
  handle('settings:update', (patch) => db.updateSettings(patch));
  handle('secrets:status', () => keychain.status());
  handle('secrets:set', async (name, value) => { if (!SECRETS[name]) throw new Error('Unknown secret'); await keychain.set(name, value); return keychain.status(); });
  handle('secrets:clear', async (name) => { if (!SECRETS[name]) throw new Error('Unknown secret'); await keychain.clear(name); return keychain.status(); });

  // generic collections
  handle('col:create', (name, obj) => { if (!COLLECTIONS_RENDERER_CAN_EDIT.has(name)) throw new Error('Not allowed'); return db.create(name, obj); });
  handle('col:update', (name, id, patch) => { if (!COLLECTIONS_RENDERER_CAN_EDIT.has(name)) throw new Error('Not allowed'); return db.update(name, id, patch); });
  handle('col:delete', async (name, id) => {
    if (!COLLECTIONS_RENDERER_CAN_EDIT.has(name)) throw new Error('Not allowed');
    if (name === 'portfolio') { const item = db.get('portfolio', id); for (const f of item?.files || []) await pf.removeFile(f); await pf.removeOwner(id); }
    if (name === 'applications') await pf.removeOwner(id);
    if (name === 'contacts') for (const a of db.list('applications')) if ((a.recommendations || []).some((r) => r.contactId === id)) db.update('applications', a.id, (x) => { x.recommendations = x.recommendations.filter((r) => r.contactId !== id); });
    return db.remove(name, id);
  });
  handle('col:reorder', (name, ids) => { if (!COLLECTIONS_RENDERER_CAN_EDIT.has(name)) throw new Error('Not allowed'); db.reorder(name, ids); });

  // opportunities
  handle('opp:create', ({ fields = {}, url = '', status = 'saved' } = {}) => {
    const now = new Date().toISOString();
    const opp = { url: url || null, status, origin: { kind: 'manual', discoveredAt: now }, fields: {}, custom: [], tags: [], notes: '', calendar: status === 'saved' ? true : undefined, check: { status: url ? 'not-checked' : 'manual' }, alsoListed: [], geo: null };
    for (const [k, v] of Object.entries(fields)) if (OPP_FIELDS.some((f) => f.key === k)) setManualField(opp, k, v, now);
    return db.create('opportunities', opp);
  });
  handle('opp:importUrl', async (url, opts = {}) => {
    const r = await discovery.importUrl(url, { status: opts.status || 'new', origin: { kind: 'url' } });
    log('import', `${url}: ${r.error ? r.error.kind : `${r.fieldsFound ?? 0} details`}`);
    return { id: r.opportunity.id, existed: r.existed, fieldsFound: r.fieldsFound, error: r.error };
  });
  handle('opp:setField', (id, key, v) => db.update('opportunities', id, (o) => setManualField(o, key, v)));
  handle('opp:verifyField', (id, key) => db.update('opportunities', id, (o) => verifyField(o, key)));
  handle('opp:verifyAll', (id, keys) => db.update('opportunities', id, (o) => { for (const k of keys || []) verifyField(o, k); }));
  handle('opp:acceptSite', (id, key) => db.update('opportunities', id, (o) => acceptSiteValue(o, key)));
  handle('opp:keepMine', (id, key) => db.update('opportunities', id, (o) => keepYourValue(o, key)));
  handle('opp:revert', (id, key) => db.update('opportunities', id, (o) => revertChange(o, key)));
  handle('opp:setStatus', (id, status) => db.update('opportunities', id, (o) => {
    o.status = status;
    if (status === 'saved' && o.calendar == null) o.calendar = true;
    if (status === 'dismissed') o.calendar = false;
  }));
  handle('opp:setStatusMany', (ids, status) => { for (const id of ids || []) db.update('opportunities', id, (o) => { o.status = status; if (status === 'dismissed') o.calendar = false; }); return true; });
  handle('opp:update', (id, patch) => db.update('opportunities', id, (o) => { for (const [k, v] of Object.entries(patch || {})) if (EDITABLE_OPP.has(k)) o[k] = v; }));
  handle('opp:delete', async (id) => {
    const opp = db.get('opportunities', id);
    if (!opp) return false;
    const apps = db.list('applications').filter((a) => a.opportunityId === id);
    const ok = await confirm({
      message: `Delete “${oppName(opp)}”?`,
      detail: apps.length ? `Its application${apps.length > 1 ? 's' : ''} (answers, notes and attached files) will be deleted too. To keep it out of the way instead, dismiss it.` : 'To keep a record but hide it, dismiss it instead.',
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return false;
    for (const a of apps) { await pf.removeOwner(a.id); db.remove('applications', a.id); }
    snapshots.remove(id);
    return db.remove('opportunities', id);
  });
  handle('opp:recheck', async (id) => {
    const r = await discovery.recheck(id);
    log('recheck', `${id}: ${r.status}${r.changed?.length ? ` changed ${r.changed.join(',')}` : ''}`);
    return r;
  });
  handle('opp:history', (id) => snapshots.read(id));
  handle('opp:geocode', async (id) => {
    const opp = db.get('opportunities', id);
    if (!opp) return null;
    if (!db.settings.map.geocode) return { error: 'Map lookups are off in Settings › Map. Set the position by hand instead.' };
    const q = Geocoder.queryFor(opp);
    if (!q) return { error: 'This opportunity has no location to look up.' };
    try {
      const hit = await geocoder.lookup(q);
      if (!hit) { db.update('opportunities', id, (o) => { o.geo = { notFound: true, query: q, at: new Date().toISOString() }; }); return { notFound: true }; }
      db.update('opportunities', id, (o) => { o.geo = { lat: hit.lat, lon: hit.lon, label: hit.label, query: q, source: 'lookup', type: hit.type }; });
      return hit;
    } catch (err) { return { error: err.message }; }
  });
  handle('opp:geocodeMissing', async () => {
    if (!db.settings.map.geocode) return { error: 'Map lookups are off in Settings › Map.' };
    const todo = db.list('opportunities').filter((o) => o.status !== 'dismissed' && !o.geo && o.fields?.mode?.value !== 'Online' && Geocoder.queryFor(o)).slice(0, 40);
    let found = 0;
    for (const o of todo) {
      try {
        const q = Geocoder.queryFor(o);
        const hit = await geocoder.lookup(q);
        db.update('opportunities', o.id, (x) => { x.geo = hit ? { lat: hit.lat, lon: hit.lon, label: hit.label, query: q, source: 'lookup', type: hit.type } : { notFound: true, query: q, at: new Date().toISOString() }; });
        if (hit) found += 1;
      } catch (err) { return { found, error: err.message }; }
    }
    return { found, tried: todo.length };
  });
  handle('opp:aiExtract', aiWrap(async (id) => {
    const c = await needAiConsent('read this opportunity page');
    if (c) return c;
    const opp = db.get('opportunities', id);
    const snap = snapshots.read(id).versions.at(-1);
    const pageText = snap?.text || opp.pageExcerpt;
    if (!pageText) return { error: 'Atelier has no page text for this opportunity yet. Re-check it first, or capture it in the Atelier browser.' };
    const r = await aiExtract(assistant, { url: opp.url, pageText, name: oppName(opp) });
    const now = new Date().toISOString();
    const updated = [];
    db.update('opportunities', id, (o) => {
      for (const [k, ex] of Object.entries(r.fields)) {
        const fv = o.fields[k];
        if (fv && (fv.origin === 'manual' || fv.verified)) continue;
        if (fv && (fv.confidence ?? 0) >= 0.8 && fv.origin !== 'listing') continue;
        o.fields[k] = { ...toFieldValue(ex, { url: o.url, now, origin: 'ai' }), provider: assistant.describe().label };
        updated.push(k);
      }
    });
    return { updated };
  }));
  handle('opp:aiFit', aiWrap(async (id) => {
    const c = await needAiConsent('explain how this opportunity fits you');
    if (c) return c;
    const opp = db.get('opportunities', id);
    const fit = assessFit(opp, db.profile, { contactsCount: db.list('contacts').length });
    const r = await aiFit(assistant, { opp, profile: db.profile, ruleReasons: fit.reasons });
    db.update('opportunities', id, (o) => { o.aiFit = { text: r.text, at: new Date().toISOString(), provider: assistant.describe().label }; });
    return r;
  }));

  // discovery and sources
  handle('discovery:run', (sourceIds) => { discovery.run({ sourceIds }).catch((err) => log('discovery', err.message)); return discovery.state; });
  handle('discovery:cancel', () => discovery.cancel());
  handle('sources:test', (src) => discovery.testSource(src));
  handle('sources:restoreDefaults', () => {
    const have = new Set(db.list('sources').map((s) => s.builtInKey).filter(Boolean));
    let added = 0;
    for (const s of defaultSources()) if (!have.has(s.builtInKey)) { db.create('sources', s); added += 1; }
    return { added };
  });
  handle('sources:signIn', (id) => {
    const s = db.get('sources', id);
    if (s) browser.open(s.homepage, { purpose: `Sign in to ${s.name} here. Atelier will use this sign-in when it checks the source.` });
  });
  handle('search:suggestions', () => suggestedQueries(db.profile));
  handle('search:run', async ({ query, provider }) => {
    const p = provider || db.settings.search.provider;
    if (p === 'claude') { const c = await needAiConsent('search the web for opportunities'); if (c) return c; }
    const r = await runSearch({ query, provider: p, db, keychain, assistant, knownUrls: db.list('opportunities').map((o) => o.url).filter(Boolean) });
    if (r.openUrl) browser.open(r.openUrl, { purpose: 'Open a result, then click Capture to add it to Discover.' });
    log('search', `${p}: ${query} → ${r.results.length} results`);
    return r;
  });
  handle('browser:open', (url, purpose) => browser.open(url, { purpose }));
  handle('instagram:browse', () => {
    const tag = (db.settings.instagram.hashtags || ['artistresidency'])[0].replace(/^#/, '');
    browser.open(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, { purpose: 'Sign in to Instagram if asked. Open a post, then click Capture to add it to Discover.' });
  });

  // applications
  handle('app:create', (oppId) => {
    const opp = db.get('opportunities', oppId);
    if (!opp) throw new Error('Opportunity not found');
    const existing = db.list('applications').find((a) => a.opportunityId === oppId);
    if (existing) return existing;
    if (opp.status !== 'saved') db.update('opportunities', oppId, (o) => { o.status = 'saved'; if (o.calendar == null) o.calendar = true; });
    return db.create('applications', {
      opportunityId: oppId, status: 'interested', statusHistory: [{ status: 'interested', at: new Date().toISOString() }],
      targetDate: null, notes: [], materials: defaultMaterials(opp), answers: [], samples: [], recommendations: [], proposalId: null, feePaid: false, submission: {},
    });
  });
  handle('app:update', (id, patch) => db.update('applications', id, (a) => {
    for (const [k, v] of Object.entries(patch || {})) {
      if (k === 'status' && v !== a.status) a.statusHistory = [...(a.statusHistory || []), { status: v, at: new Date().toISOString() }];
      if (k === 'submission' || k === 'opportunityId') continue;
      a[k] = v;
    }
  }));
  handle('app:delete', async (id) => {
    const a = db.get('applications', id);
    if (!a) return false;
    const opp = db.get('opportunities', a.opportunityId);
    const ok = await confirm({ message: `Delete your application to “${oppName(opp)}”?`, detail: 'Its answers, notes, sample selection and attached files will be deleted. The opportunity stays saved.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return false;
    await pf.removeOwner(id);
    return db.remove('applications', id);
  });
  handle('app:attachFile', async (appId, materialId) => {
    const res = await dialog.showOpenDialog(win, { title: 'Attach a File', buttonLabel: 'Attach', properties: ['openFile'] });
    if (res.canceled || !res.filePaths.length) return null;
    const [file] = await pf.importFiles(appId, res.filePaths, { copy: true });
    if (!file) return null;
    db.update('applications', appId, (a) => {
      const m = (a.materials || []).find((x) => x.id === materialId);
      if (m) { if (m.file) pf.removeFile(m.file); m.file = file; if (m.status === 'todo') m.status = 'done'; }
    });
    return file;
  });
  handle('file:open', (fileId) => { const hit = pf.find(fileId); if (hit) return shell.openPath(pf.pathOf(hit.file)); return 'File not found'; });
  handle('file:reveal', (fileId) => { const hit = pf.find(fileId); if (hit) shell.showItemInFolder(pf.pathOf(hit.file)); });
  handle('app:review', (id) => {
    const r = buildReview(db, id, { staleAfterDays: db.settings.general.staleAfterDays });
    return r && { ...r, app: undefined, opp: undefined, proposal: r.proposal ? { id: r.proposal.id, title: r.proposal.title, sections: r.proposal.sections, tailoredFor: r.proposal.tailoredFor } : null };
  });
  handle('app:confirm', (id, hash) => {
    const r = buildReview(db, id);
    if (!r) throw new Error('Application not found');
    if (r.hash !== hash) return { error: 'The application changed while you were reviewing it. Review it again.' };
    db.update('applications', id, (a) => {
      a.submission = { ...(a.submission || {}), confirmedAt: new Date().toISOString(), confirmedHash: hash };
      if (['interested', 'preparing'].includes(a.status)) { a.status = 'review'; a.statusHistory = [...(a.statusHistory || []), { status: 'review', at: new Date().toISOString() }]; }
    });
    return { ok: true };
  });
  handle('app:unconfirm', (id) => db.update('applications', id, (a) => { a.submission = { ...(a.submission || {}), confirmedAt: null, confirmedHash: null }; }));
  handle('app:exportPackage', async (id) => {
    const r = buildReview(db, id);
    if (!r) throw new Error('Application not found');
    const res = await dialog.showOpenDialog(win, { title: 'Export Application Package', message: 'Choose where to put the package folder.', buttonLabel: 'Export Here', properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('documents') });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    const out = await exportPackage({ review: r, profile: db.profile, parentDir: res.filePaths[0], portfolioFiles: pf, renderPdf: htmlToPdf });
    shell.openPath(out.dir);
    return out;
  });
  handle('app:openPortal', async (id) => {
    const r = buildReview(db, id);
    if (!r) throw new Error('Application not found');
    if (!r.confirmed) return { needsConfirmation: true, changed: r.changedSinceConfirm };
    if (!r.applyUrl) return { error: 'No application link is recorded. Add one on the opportunity page.' };
    const ok = await confirm({
      message: `Open the application form at ${hostOf(r.applyUrl)}?`,
      detail: `Atelier opens the page in your browser. You submit there yourself; nothing is sent by Atelier.\n\nTip: Export Package first for numbered sample files and copy-ready answers.\n\n${r.applyUrl}`,
      confirmLabel: 'Open Form',
    });
    if (!ok) return { canceled: true };
    openExternal(r.applyUrl);
    return { opened: true };
  });
  handle('app:markSubmitted', async (id, { submittedAt, reference } = {}) => {
    const r = buildReview(db, id);
    if (!r) throw new Error('Application not found');
    if (!r.confirmed) {
      const ok = await confirm({ message: 'Mark as submitted without a confirmed review?', detail: 'You haven’t confirmed the review for the current version of this application.', confirmLabel: 'Mark Submitted' });
      if (!ok) return { canceled: true };
    }
    db.update('applications', id, (a) => {
      a.submission = { ...(a.submission || {}), submittedAt: submittedAt || todayISO(), reference: reference || '' };
      a.status = 'submitted';
      a.statusHistory = [...(a.statusHistory || []), { status: 'submitted', at: new Date().toISOString() }];
    });
    return { ok: true };
  });
  handle('rec:sendRequest', async (appId, recId, { subject, body }) => {
    const a = db.get('applications', appId);
    const rec = a?.recommendations?.find((r) => r.id === recId);
    const contact = rec && db.get('contacts', rec.contactId);
    if (!contact) throw new Error('Recommender not found');
    if (!contact.email) return { error: `Add an email address for ${contact.name} first.` };
    const ok = await confirm({
      message: `Open this request to ${contact.name} in Mail?`,
      detail: `To: ${contact.email}\nSubject: ${subject}\n\n${String(body).slice(0, 900)}${String(body).length > 900 ? '…' : ''}\n\nMail opens with the message ready; you send it yourself.`,
      confirmLabel: 'Open in Mail',
    });
    if (!ok) return { canceled: true };
    openExternal(`mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    db.update('applications', appId, (x) => {
      const r = x.recommendations.find((y) => y.id === recId);
      if (r) { r.requestDraft = { subject, body }; if (r.status === 'to-ask') r.status = 'asked'; r.requestedAt = todayISO(); }
    });
    return { ok: true };
  });

  // writing + AI
  handle('writing:createTailored', ({ proposalId, oppId, appId, sections, notes }) => {
    const orig = db.get('proposals', proposalId);
    const opp = db.get('opportunities', oppId);
    if (!orig || !opp) throw new Error('Proposal or opportunity not found');
    const copy = db.create('proposals', {
      title: `${orig.title} — for ${oppName(opp).slice(0, 60)}`,
      sections: { ...(orig.sections || {}), ...(sections || {}) },
      tags: orig.tags || [],
      tailoredFrom: { proposalId, title: orig.title, at: new Date().toISOString(), originalSections: orig.sections },
      tailoredFor: { oppId, name: oppName(opp) },
      aiNotes: notes || [],
      versions: [],
    });
    if (appId) db.update('applications', appId, (a) => {
      a.proposalId = copy.id;
      const m = (a.materials || []).find((x) => x.type === 'proposal');
      if (m && m.status === 'todo') m.status = 'drafting';
    });
    return copy;
  });
  handle('ai:describe', () => assistant.describe());
  handle('ai:test', aiWrap(async () => {
    const c = await needAiConsent('test the connection');
    if (c) return c;
    return assistant.test();
  }));
  handle('ai:log', () => assistant.readLog());
  handle('ai:tailor', aiWrap(async ({ proposalId, oppId, suggestions }) => {
    const c = await needAiConsent('tailor your proposal');
    if (c) return c;
    const proposal = db.get('proposals', proposalId);
    const opp = db.get('opportunities', oppId);
    return aiTailor(assistant, { proposal, opp, profile: db.profile, suggestions });
  }));
  handle('ai:draftAnswer', aiWrap(async ({ appId, question, limit, notes, snippetIds }) => {
    const c = await needAiConsent('draft an answer');
    if (c) return c;
    const a = appId ? db.get('applications', appId) : null;
    const opp = a ? db.get('opportunities', a.opportunityId) : null;
    const prop = a?.proposalId ? db.get('proposals', a.proposalId) : null;
    const proposalText = prop ? Object.values(prop.sections || {}).filter(Boolean).join('\n\n') : '';
    const snippets = (snippetIds?.length ? snippetIds.map((id) => db.get('snippets', id)) : db.list('snippets').filter((s) => ['bio', 'statement'].includes(s.kind))).filter(Boolean).slice(0, 4);
    return aiDraftAnswer(assistant, { question, limit, opp, profile: db.profile, proposalText, snippets, notes });
  }));
  handle('ai:shorten', aiWrap(async ({ text, limit }) => {
    const c = await needAiConsent('shorten your text');
    if (c) return c;
    return aiShorten(assistant, { text, limit });
  }));

  // portfolio
  const addItemsFromPaths = async (itemId, paths) => {
    if (itemId) {
      const files = await pf.importFiles(itemId, paths);
      db.update('portfolio', itemId, (it) => { it.files = [...(it.files || []), ...files]; });
      return [db.get('portfolio', itemId)];
    }
    const created = [];
    for (const p of paths) {
      const item = db.create('portfolio', { title: path.basename(p).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), year: '', medium: '', dimensions: '', caption: '', description: '', projectId: null, tags: [], links: [], credits: '', files: [] });
      const files = await pf.importFiles(item.id, [p]);
      db.update('portfolio', item.id, (it) => { it.files = files; it.kind = files[0]?.kind; });
      created.push(db.get('portfolio', item.id));
    }
    return created;
  };
  handle('portfolio:addFiles', async (itemId) => {
    const res = await dialog.showOpenDialog(win, { title: itemId ? 'Add Files to This Work' : 'Add Work Samples', buttonLabel: 'Add', properties: ['openFile', 'multiSelections'] });
    if (res.canceled || !res.filePaths.length) return [];
    return addItemsFromPaths(itemId, res.filePaths);
  });
  handle('portfolio:addPaths', (itemId, paths) => addItemsFromPaths(itemId, (paths || []).filter((p) => typeof p === 'string' && fs.existsSync(p))));
  handle('portfolio:removeFile', async (itemId, fileId) => {
    const item = db.get('portfolio', itemId);
    const f = item?.files?.find((x) => x.id === fileId);
    if (!f) return false;
    await pf.removeFile(f);
    db.update('portfolio', itemId, (it) => { it.files = it.files.filter((x) => x.id !== fileId); });
    return true;
  });
  handle('portfolio:fileStatus', () => {
    const out = {};
    for (const it of db.list('portfolio')) for (const f of it.files || []) out[f.id] = { missing: pf.missing(f) };
    return out;
  });

  // calendar
  handle('calendar:export', async ({ ids, mode = 'calendar' }) => {
    const all = calendarItems(db.snapshot(), { includeHidden: true });
    const items = all.filter((i) => (ids || []).includes(i.id));
    if (!items.length) return { error: 'Nothing selected to export.' };
    const ics = buildIcs(items, { alarmsDaysBefore: db.settings.calendar.alarmsDaysBefore });
    if (mode === 'file') {
      const res = await dialog.showSaveDialog(win, { title: 'Save Calendar File', defaultPath: path.join(app.getPath('downloads'), 'Atelier deadlines.ics'), filters: [{ name: 'Calendar', extensions: ['ics'] }] });
      if (res.canceled || !res.filePath) return { canceled: true };
      fs.writeFileSync(res.filePath, ics);
      shell.showItemInFolder(res.filePath);
      return { file: res.filePath, count: items.length };
    }
    const ok = await confirm({
      message: `Add ${items.length} event${items.length === 1 ? '' : 's'} to Apple Calendar?`,
      detail: `Calendar opens and asks which calendar to add them to. Deadlines get reminders ${db.settings.calendar.alarmsDaysBefore.map((d) => `${d} day${d === 1 ? '' : 's'}`).join(' and ')} before.\n\nExporting again later updates events with the same name and date instead of adding duplicates in most cases.\n\n${items.slice(0, 8).map((i) => `• ${i.date}  ${i.title}`).join('\n')}${items.length > 8 ? `\n…and ${items.length - 8} more` : ''}`,
      confirmLabel: 'Open Calendar',
    });
    if (!ok) return { canceled: true };
    const dir = path.join(dataDir, 'Exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `Atelier deadlines ${new Date().toISOString().slice(0, 10)}.ics`);
    fs.writeFileSync(file, ics);
    if (process.platform === 'darwin') execFile('/usr/bin/open', ['-a', 'Calendar', file], (err) => { if (err) shell.openPath(file); });
    else shell.openPath(file);
    db.state.data.calendarExportedAt = new Date().toISOString();
    db.state.save();
    return { file, count: items.length };
  });

  // backups
  handle('backup:now', () => actions.backupNow());
  handle('backup:to', () => actions.backupTo());
  handle('backup:list', () => backups.list());
  handle('backup:restore', (file) => actions.restore(file));
  handle('backup:export', () => actions.exportData());
  handle('backup:reveal', (file) => { if (file && fs.existsSync(file)) shell.showItemInFolder(file); else shell.openPath(backups.folder); });
  handle('backup:chooseFolder', async () => {
    const res = await dialog.showOpenDialog(win, { title: 'Choose Backup Folder', message: 'Pick a folder for automatic backups — another drive or a synced folder protects you best.', buttonLabel: 'Choose', properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;
    db.updateSettings({ backups: { folder: res.filePaths[0] } });
    return res.filePaths[0];
  });

  // updates
  handle('updates:status', () => updater.status);
  handle('updates:check', () => updater.check({ manual: true }));
  handle('updates:download', () => updater.download());
  handle('updates:install', () => updater.install());
  handle('updates:setToken', (token) => updater.setToken(token));
  handle('updates:clearToken', () => updater.clearToken());
  handle('updates:hasToken', () => updater.hasToken());
  handle('updates:skip', (version) => updater.skip(version));

  // the Atelier browser's toolbar
  handle('browser:command', (cmd, arg) => browser.command(cmd, arg));
  handle('browser:capture', (opts) => browser.capture(opts));
}

// ---------------------------------------------------------------- background work

function startBackgroundWork() {
  const tick = async () => {
    try { await backups.autoBackupIfDue(); } catch (err) { log('backup', `auto backup failed: ${err.message}`); }
    try { await discovery.recheckDue(); } catch (err) { log('recheck', err.message); }
    const every = Number(db.settings.general.discoverEveryHours || 0);
    const last = Date.parse(db.state.data.discovery?.lastRunAt || 0) || 0;
    if (every > 0 && Date.now() - last > every * 3600 * 1000 && !discovery.state.running) discovery.run().catch((err) => log('discovery', err.message));
  };
  setTimeout(tick, process.env.ATELIER_E2E ? 3600 * 1000 : 40 * 1000);
  setInterval(tick, 30 * 60 * 1000);
}

// ---------------------------------------------------------------- lifecycle

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

app.whenReady().then(async () => {
  db = new Database(dataDir);
  keychain = new Keychain(path.join(dataDir, 'Secrets'));
  fetcher = new Fetcher({ fetchImpl: sessionFetch, renderImpl: process.env.ATELIER_NO_RENDER ? null : renderPage, log, perHostDelayMs: process.env.ATELIER_E2E ? 50 : undefined });
  snapshots = new Snapshots(path.join(dataDir, 'Snapshots'));
  assistant = new Assistant({ db, keychain, logDir: logsDir });
  geocoder = new Geocoder({ dir: dataDir });
  pf = new PortfolioFiles({ db, dir: path.join(dataDir, 'Portfolio'), thumbsDir: path.join(dataDir, 'Cache', 'Thumbnails'), makeThumb });
  backups = new Backups({ db, dataDir, portfolioDir: path.join(dataDir, 'Portfolio'), snapshotsDir: path.join(dataDir, 'Snapshots'), appVersion: app.getVersion() });
  discovery = new Discovery({ db, fetcher, snapshots, log, notify, instagram: new Instagram({ db, keychain }) });
  updater = new Updater({
    state: db.state, workDir: path.join(dataDir, 'Updates'), currentVersion: app.getVersion(), isPackaged: app.isPackaged,
    quit: () => app.quit(), keychain, settings: () => db.settings.updates,
  });
  browser = new AtelierBrowser({
    preload: path.join(__dirname, '..', 'preload', 'browser-preload.cjs'),
    toolbarUrl: 'atelier-app://app/browser.html',
    onCapture: async ({ url, html, status }) => {
      let r;
      if (/(^|\.)instagram\.com$/.test(hostOf(url))) {
        const meta = getMeta(parseHtml(html));
        const caption = (meta.description || meta.ogTitle || '').replace(/^[\d,.]+\s+likes?,\s+[\d,.]+\s+comments?\s+-\s+/i, '');
        const { extractFromText } = await import('./discovery/crawler.mjs');
        const ex = extractFromText(caption, url, { aggregator: false });
        const { buildOpportunity } = await import('./opportunities.mjs');
        const opp = db.create('opportunities', buildOpportunity({ url, extraction: ex, origin: { kind: 'instagram' }, status, fieldOrigin: 'instagram' }));
        snapshots.add(opp.id, caption, { url });
        r = { opportunity: opp, fieldsFound: Object.keys(ex.fields).length };
      } else r = discovery.captureHtml({ url, html, status, origin: { kind: 'capture' } });
      log('capture', `${url}: ${r.updated ? 'updated' : 'added'}`);
      send('browser:captured', { id: r.opportunity.id, updated: Boolean(r.updated), name: oppName(r.opportunity) });
      return { id: r.opportunity.id, name: oppName(r.opportunity), updated: Boolean(r.updated), fieldsFound: r.fieldsFound };
    },
  });

  db.on('changed', (name, data) => {
    send('db:changed', name, data);
    if (name === 'settings') send('ai:info', assistant.describe());
  });
  discovery.on('progress', (s) => send('discovery:progress', s));
  updater.on('status', (s) => send('updates:status', s));

  app.setAboutPanelOptions({ applicationName: config.appName, applicationVersion: app.getVersion(), copyright: `© ${new Date().getFullYear()} Freeman Edwards` });

  handleSchemes({ appRoot: path.join(__dirname, '..', 'renderer'), portfolioFiles: pf });
  registerIpc();
  buildAppMenu({ send: (cmd, ...args) => send('menu:command', cmd, ...args), actions });
  createWindow();
  updater.startAutomaticChecks();
  startBackgroundWork();
  if (db.recovered.length) log('store', `recovered from previous copies: ${db.recovered.join(', ')}`);

  if (process.env.ATELIER_E2E) {
    const driver = await import(process.env.ATELIER_E2E_DRIVER || path.join(__dirname, '..', '..', 'test', 'e2e', 'driver.mjs'));
    driver.run({ app, win: () => win, db, discovery, updater, browser, backups, pf, actions });
  }

  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  try {
    discovery?.cancel();
    db?.flushAll();
    geocoder?.flush();
  } catch (err) {
    console.error(err);
  }
});
