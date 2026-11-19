// JSON persistence: atomic writes, a previous-version copy, debounced saves and a sync flush on quit.
import fs from 'node:fs';
import path from 'node:path';

export class JsonFile {
  constructor(file, defaults, { onRecover } = {}) {
    this.file = file;
    this.defaults = defaults;
    this.timer = null;
    this.onRecover = onRecover;
    this.data = this.#load();
  }

  #read(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  #load() {
    const base = structuredClone(this.defaults);
    try {
      return { ...base, ...this.#read(this.file) };
    } catch (err) {
      if (err.code === 'ENOENT') return base;
      // Keep the unreadable file, then fall back to the previous good version.
      try { fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`); } catch {}
      console.error(`[store] could not read ${this.file}:`, err.message);
      try {
        const prev = this.#read(`${this.file}.previous`);
        this.onRecover?.(this.file);
        return { ...base, ...prev };
      } catch {
        return base;
      }
    }
  }

  reload() {
    clearTimeout(this.timer);
    this.timer = null;
    this.data = this.#load();
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    try { if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.previous`); } catch {}
    fs.renameSync(tmp, this.file);
  }

  get pending() {
    return this.timer != null;
  }
}
