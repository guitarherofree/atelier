// Atelier's local database: one JSON file per collection in the data folder.
// Everything you enter stays in ~/Library/Application Support/Atelier unless you export or back it up.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { JsonFile } from './store.mjs';
import { DEFAULT_SETTINGS } from '../config.mjs';
import { DEFAULT_PROFILE } from '../shared/fit.mjs';
import { uid } from '../shared/schema.mjs';
import { defaultSources } from './discovery/sources.mjs';
import { detectFocus } from './extract/focus.mjs';

export const COLLECTIONS = ['opportunities', 'applications', 'sources', 'contacts', 'portfolio', 'projects', 'proposals', 'snippets'];
const PREFIX = {
  opportunities: 'opp_', applications: 'app_', sources: 'src_', contacts: 'ct_', portfolio: 'pf_', projects: 'prj_', proposals: 'prop_', snippets: 'txt_',
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

export class Database extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    this.recovered = [];
    fs.mkdirSync(dir, { recursive: true });
    const onRecover = (file) => this.recovered.push(path.basename(file));
    this.files = {};
    for (const name of COLLECTIONS) {
      this.files[name] = new JsonFile(path.join(dir, `${name}.json`), { schemaVersion: 1, items: [] }, { onRecover });
    }
    this.profileFile = new JsonFile(path.join(dir, 'profile.json'), structuredClone(DEFAULT_PROFILE), { onRecover });
    this.settingsFile = new JsonFile(path.join(dir, 'settings.json'), structuredClone(DEFAULT_SETTINGS), { onRecover });
    this.state = new JsonFile(path.join(dir, 'state.json'), { version: 1, window: null, ui: null, updates: null, discovery: {}, backups: {} });
    this.#migrate();
    this.pendingEmit = new Map();
  }

  #migrate() {
    // Settings and profile keep any new defaults added in later versions.
    this.settingsFile.data = deepMerge(structuredClone(DEFAULT_SETTINGS), this.settingsFile.data);
    this.profileFile.data = deepMerge(structuredClone(DEFAULT_PROFILE), this.profileFile.data);
    // First launch: the built-in sources.
    if (!this.files.sources.data.seeded) {
      const existing = new Set(this.files.sources.data.items.map((s) => s.builtInKey).filter(Boolean));
      for (const s of defaultSources()) if (!existing.has(s.builtInKey)) this.files.sources.data.items.push({ id: uid(PREFIX.sources), createdAt: new Date().toISOString(), ...s });
      this.files.sources.data.seeded = true;
      this.files.sources.save();
    }
    // 1.1: work out the residency focus for opportunities saved before Atelier tracked it, from the page
    // text it already has. Re-checks keep it up to date after that.
    const opps = this.files.opportunities.data;
    if (!opps.focusBackfilled) {
      for (const o of opps.items) {
        o.fields = o.fields || {};
        if (o.fields.focus) continue;
        const r = detectFocus([o.pageExcerpt, o.fields.description?.value].filter(Boolean).join('\n'), { type: o.fields.type?.value });
        if (!r) continue;
        const at = o.check?.lastCheckedAt || o.createdAt || new Date().toISOString();
        o.fields.focus = { value: r.value, text: r.text, origin: 'extracted', method: 'wording', confidence: r.confidence, evidence: r.evidence, sourceUrl: o.url || undefined, extractedAt: at, checkedAt: at };
      }
      opps.focusBackfilled = true;
      this.files.opportunities.save();
    }
  }

  // ---------------------------------------------------------------- generic collections

  list(name) {
    return this.files[name].data.items;
  }

  get(name, id) {
    return this.files[name].data.items.find((x) => x.id === id) || null;
  }

  create(name, obj = {}) {
    const now = new Date().toISOString();
    const item = { ...obj, id: obj.id || uid(PREFIX[name] || ''), createdAt: obj.createdAt || now, updatedAt: now };
    this.files[name].data.items.push(item);
    this.touch(name);
    return item;
  }

  /** Shallow-merge a patch, or pass a function that edits the item in place. */
  update(name, id, patch) {
    const item = this.get(name, id);
    if (!item) return null;
    if (typeof patch === 'function') patch(item);
    else Object.assign(item, patch || {});
    item.updatedAt = new Date().toISOString();
    this.touch(name);
    return item;
  }

  remove(name, id) {
    const items = this.files[name].data.items;
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    items.splice(i, 1);
    this.touch(name);
    return true;
  }

  reorder(name, ids) {
    const items = this.files[name].data.items;
    const pos = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    this.touch(name);
  }

  touch(name) {
    this.files[name].save();
    this.#emit(name);
  }

  // ---------------------------------------------------------------- profile + settings

  get profile() { return this.profileFile.data; }
  get settings() { return this.settingsFile.data; }

  updateProfile(patch) {
    this.profileFile.data = deepMerge(this.profileFile.data, patch);
    this.profileFile.save();
    this.#emit('profile');
    return this.profileFile.data;
  }

  updateSettings(patch) {
    this.settingsFile.data = deepMerge(this.settingsFile.data, patch);
    this.settingsFile.save();
    this.#emit('settings');
    return this.settingsFile.data;
  }

  // ---------------------------------------------------------------- events

  #emit(name) {
    if (this.pendingEmit.has(name)) return;
    this.pendingEmit.set(name, setTimeout(() => {
      this.pendingEmit.delete(name);
      this.emit('changed', name, this.snapshotOf(name));
    }, 30));
  }

  snapshotOf(name) {
    if (name === 'profile') return this.profile;
    if (name === 'settings') return this.settings;
    return this.files[name].data.items;
  }

  snapshot() {
    const out = { profile: this.profile, settings: this.settings };
    for (const name of COLLECTIONS) out[name] = this.list(name);
    return out;
  }

  // ---------------------------------------------------------------- files

  allFiles() {
    return [...Object.values(this.files), this.profileFile, this.settingsFile, this.state];
  }

  flushAll() {
    for (const f of this.allFiles()) if (f.pending) f.flush();
  }

  reloadAll() {
    for (const f of this.allFiles()) f.reload();
    this.#migrate();
    for (const name of [...COLLECTIONS, 'profile', 'settings']) this.#emit(name);
  }

  dataFileNames() {
    return [...COLLECTIONS.map((n) => `${n}.json`), 'profile.json', 'settings.json'];
  }
}
