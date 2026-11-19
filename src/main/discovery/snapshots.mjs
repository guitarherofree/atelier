// The readable text of each opportunity page as last seen, so you can see what changed between checks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class Snapshots {
  constructor(dir, { keep = 4 } = {}) {
    this.dir = dir;
    this.keep = keep;
    fs.mkdirSync(dir, { recursive: true });
  }

  #file(id) {
    return path.join(this.dir, `${id.replace(/[^\w-]/g, '_')}.json`);
  }

  read(id) {
    try { return JSON.parse(fs.readFileSync(this.#file(id), 'utf8')); } catch { return { versions: [] }; }
  }

  /** Store page text; returns true when it differs from the last version. */
  add(id, text, { url, at = new Date().toISOString() } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    const hash = crypto.createHash('sha1').update(clean.replace(/\s+/g, ' ')).digest('hex');
    const snap = this.read(id);
    const last = snap.versions[snap.versions.length - 1];
    if (last && last.hash === hash) {
      last.lastSeenAt = at;
      fs.writeFileSync(this.#file(id), JSON.stringify(snap));
      return false;
    }
    snap.versions.push({ at, lastSeenAt: at, hash, url, text: clean.slice(0, 80000) });
    while (snap.versions.length > this.keep) snap.versions.shift();
    fs.writeFileSync(this.#file(id), JSON.stringify(snap));
    return Boolean(last);
  }

  remove(id) {
    try { fs.rmSync(this.#file(id), { force: true }); } catch {}
  }
}
