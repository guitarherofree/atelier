// Portfolio files: copied into Atelier's library (or linked in place), with thumbnails.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { uid } from '../shared/schema.mjs';

const KINDS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'],
  video: ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'],
  audio: ['mp3', 'wav', 'aif', 'aiff', 'm4a', 'aac', 'flac', 'ogg'],
  pdf: ['pdf'],
  doc: ['doc', 'docx', 'pages', 'rtf', 'txt', 'md', 'odt'],
};

export function kindOf(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  for (const [k, list] of Object.entries(KINDS)) if (list.includes(ext)) return k;
  return 'other';
}

const LINK_ABOVE = 500 * 1024 * 1024;

export class PortfolioFiles {
  constructor({ db, dir, thumbsDir, makeThumb = null }) {
    this.db = db;
    this.dir = dir;
    this.thumbsDir = thumbsDir;
    this.makeThumb = makeThumb;
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  pathOf(file) {
    if (file.linkedPath) return file.linkedPath;
    return path.join(this.dir, file.relPath);
  }

  find(fileId) {
    for (const item of this.db.list('portfolio')) {
      const f = (item.files || []).find((x) => x.id === fileId);
      if (f) return { item, file: f };
    }
    for (const app of this.db.list('applications')) {
      const m = (app.materials || []).find((x) => x.file?.id === fileId);
      if (m) return { app, file: m.file };
    }
    return null;
  }

  /** Copy (or link) files into the library under a folder for one item. */
  async importFiles(ownerId, paths, { copy = this.db.settings.portfolio.copyFiles } = {}) {
    const out = [];
    for (const p of paths) {
      let st;
      try { st = await fsp.stat(p); } catch { continue; }
      if (!st.isFile()) continue;
      const id = uid('f_');
      const name = path.basename(p);
      const entry = { id, name, kind: kindOf(name), size: st.size, addedAt: new Date().toISOString() };
      if (copy && st.size <= LINK_ABOVE) {
        const rel = path.join(ownerId, `${id}-${name.replace(/[/\\:]/g, '-')}`);
        await fsp.mkdir(path.join(this.dir, ownerId), { recursive: true });
        await fsp.copyFile(p, path.join(this.dir, rel));
        entry.relPath = rel;
      } else {
        entry.linkedPath = p;
        entry.linked = true;
      }
      entry.sha1 = await sha1(this.pathOf(entry)).catch(() => null);
      await this.thumbnail(entry);
      out.push(entry);
    }
    return out;
  }

  async thumbnail(entry) {
    if (!this.makeThumb) return null;
    try {
      const buf = await this.makeThumb(this.pathOf(entry), entry.kind);
      if (!buf) return null;
      const t = path.join(this.thumbsDir, `${entry.id}.png`);
      await fsp.writeFile(t, buf);
      entry.thumb = true;
      return t;
    } catch {
      return null;
    }
  }

  thumbPath(fileId) {
    const t = path.join(this.thumbsDir, `${fileId}.png`);
    return fs.existsSync(t) ? t : null;
  }

  async removeFile(file) {
    if (!file.linkedPath && file.relPath) await fsp.rm(path.join(this.dir, file.relPath), { force: true });
    await fsp.rm(path.join(this.thumbsDir, `${file.id}.png`), { force: true });
  }

  async removeOwner(ownerId) {
    const d = path.join(this.dir, ownerId);
    if (d.startsWith(this.dir + path.sep)) await fsp.rm(d, { recursive: true, force: true });
  }

  missing(file) {
    return !fs.existsSync(this.pathOf(file));
  }
}

function sha1(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}
