// Backups (one .zip you can restore) and readable exports (JSON, CSV and Markdown you can open anywhere).
// API keys and tokens are never included: they stay in the Keychain.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { OPP_FIELDS, fieldText, oppName, APP_STATUS_BY_KEY, PROPOSAL_SECTIONS, verifyCount } from '../shared/schema.mjs';
import { assessFit } from '../shared/fit.mjs';

const stampOf = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
};

function walk(dir, base = dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.isFile()) out.push({ full, rel: path.relative(base, full) });
  }
  return out;
}

function zipTo(dest, add) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    const out = fs.createWriteStream(tmp);
    zip.outputStream.pipe(out).on('close', () => {
      try { fs.renameSync(tmp, dest); resolve(dest); } catch (err) { reject(err); }
    }).on('error', reject);
    try { add(zip); zip.end(); } catch (err) { reject(err); }
  });
}

function unzip(file, destDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zf) => {
      if (err) return reject(new Error(`This file isn’t a readable backup (${err.message}).`));
      const root = path.resolve(destDir);
      zf.readEntry();
      zf.on('entry', (entry) => {
        const target = path.resolve(root, entry.fileName);
        if (!target.startsWith(root + path.sep)) return zf.readEntry(); // ignore unsafe paths
        if (/\/$/.test(entry.fileName)) { fs.mkdirSync(target, { recursive: true }); return zf.readEntry(); }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        zf.openReadStream(entry, (e2, stream) => {
          if (e2) return reject(e2);
          stream.pipe(fs.createWriteStream(target)).on('close', () => zf.readEntry()).on('error', reject);
        });
      });
      zf.on('end', resolve);
      zf.on('error', reject);
    });
  });
}

export class Backups {
  constructor({ db, dataDir, portfolioDir, snapshotsDir, appVersion }) {
    this.db = db;
    this.dataDir = dataDir;
    this.portfolioDir = portfolioDir;
    this.snapshotsDir = snapshotsDir;
    this.appVersion = appVersion;
  }

  get folder() {
    return this.db.settings.backups.folder || path.join(this.dataDir, 'Backups');
  }

  counts() {
    return {
      opportunities: this.db.list('opportunities').length,
      applications: this.db.list('applications').length,
      portfolio: this.db.list('portfolio').length,
      proposals: this.db.list('proposals').length,
      snippets: this.db.list('snippets').length,
      contacts: this.db.list('contacts').length,
    };
  }

  /** Make a backup .zip. `dest` defaults to the backup folder. */
  async create({ dest, includeFiles, auto = false } = {}) {
    this.db.flushAll();
    const withFiles = includeFiles ?? this.db.settings.backups.includePortfolioFiles;
    const file = dest || path.join(this.folder, `Atelier Backup ${stampOf()}${auto ? ' (auto)' : ''}.zip`);
    const manifest = {
      app: 'Atelier', format: 1, appVersion: this.appVersion, createdAt: new Date().toISOString(), host: os.hostname(),
      includesPortfolioFiles: withFiles, counts: this.counts(),
    };
    await zipTo(file, (zip) => {
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json');
      for (const name of this.db.dataFileNames()) {
        const p = path.join(this.dataDir, name);
        if (fs.existsSync(p)) zip.addFile(p, `data/${name}`);
      }
      for (const f of walk(this.snapshotsDir)) zip.addFile(f.full, `snapshots/${f.rel.split(path.sep).join('/')}`);
      if (withFiles) for (const f of walk(this.portfolioDir)) zip.addFile(f.full, `portfolio/${f.rel.split(path.sep).join('/')}`);
    });
    const st = fs.statSync(file);
    if (auto) this.prune();
    this.db.state.data.backups = { ...(this.db.state.data.backups || {}), lastAt: manifest.createdAt, lastFile: file, ...(auto ? { lastAutoAt: manifest.createdAt } : {}) };
    this.db.state.save();
    return { file, size: st.size, manifest };
  }

  list() {
    let names = [];
    try { names = fs.readdirSync(this.folder).filter((n) => /^Atelier Backup .*\.zip$/.test(n)); } catch { return []; }
    return names.map((n) => {
      const full = path.join(this.folder, n);
      const st = fs.statSync(full);
      return { file: full, name: n, size: st.size, at: st.mtime.toISOString(), auto: /\(auto\)/.test(n) };
    }).sort((a, b) => b.at.localeCompare(a.at));
  }

  prune() {
    const keep = Math.max(1, Number(this.db.settings.backups.keep || 14));
    const autos = this.list().filter((b) => b.auto);
    for (const b of autos.slice(keep)) { try { fs.rmSync(b.file, { force: true }); } catch {} }
  }

  async autoBackupIfDue() {
    const s = this.db.settings.backups;
    if (!s.auto) return null;
    const last = Date.parse(this.db.state.data.backups?.lastAutoAt || 0) || 0;
    if (Date.now() - last < 22 * 3600 * 1000) return null;
    return this.create({ auto: true });
  }

  async inspect(file) {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'atelier-inspect-'));
    try {
      await unzip(file, tmp);
      const manifest = JSON.parse(await fsp.readFile(path.join(tmp, 'manifest.json'), 'utf8'));
      if (manifest.app !== 'Atelier') throw new Error('This zip isn’t an Atelier backup.');
      return manifest;
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error('This zip isn’t an Atelier backup (no manifest).');
      throw err;
    } finally {
      fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Replace current data with a backup. Makes a safety backup of the current data first. */
  async restore(file) {
    const manifest = await this.inspect(file);
    const safety = await this.create({ dest: path.join(this.folder, `Atelier Backup ${stampOf()} (before restore).zip`), includeFiles: false });
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'atelier-restore-'));
    try {
      await unzip(file, tmp);
      for (const name of this.db.dataFileNames()) {
        const src = path.join(tmp, 'data', name);
        const dst = path.join(this.dataDir, name);
        if (fs.existsSync(src)) {
          JSON.parse(fs.readFileSync(src, 'utf8')); // must be valid
          fs.copyFileSync(src, `${dst}.restoring`);
          fs.renameSync(`${dst}.restoring`, dst);
        }
      }
      const snapSrc = path.join(tmp, 'snapshots');
      if (fs.existsSync(snapSrc)) for (const f of walk(snapSrc)) {
        const dst = path.join(this.snapshotsDir, f.rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(f.full, dst);
      }
      const pfSrc = path.join(tmp, 'portfolio');
      if (fs.existsSync(pfSrc)) for (const f of walk(pfSrc)) {
        const dst = path.join(this.portfolioDir, f.rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(f.full, dst);
      }
      this.db.reloadAll();
      return { manifest, safetyBackup: safety.file };
    } finally {
      fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** A folder of readable files: everything as JSON, plus CSV tables and Markdown writing. */
  async exportReadable(parentDir) {
    this.db.flushAll();
    const dir = path.join(parentDir, `Atelier Export ${stampOf()}`);
    await fsp.mkdir(dir, { recursive: true });
    const snap = this.db.snapshot();
    await fsp.writeFile(path.join(dir, 'atelier-data.json'), JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: this.appVersion, ...snap, settings: undefined }, null, 2));

    const csv = (rows) => rows.map((r) => r.map((c) => {
      const s = c == null ? '' : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const apps = snap.applications;
    const ctx = { contactsCount: snap.contacts.length };
    const oppRows = [['Name', 'Status', 'Application status', ...OPP_FIELDS.filter((f) => f.key !== 'name' && f.key !== 'description').map((f) => f.label), 'Fit', 'Page', 'Last checked', 'Details to verify']];
    for (const o of snap.opportunities) {
      const app = apps.find((a) => a.opportunityId === o.id);
      const fit = assessFit(o, snap.profile, ctx);
      oppRows.push([oppName(o), o.status, app ? APP_STATUS_BY_KEY[app.status]?.label : '',
        ...OPP_FIELDS.filter((f) => f.key !== 'name' && f.key !== 'description').map((f) => {
          const fv = o.fields?.[f.key];
          if (f.key === 'programDates' && fv?.value?.start) return `${fv.value.start}${fv.value.end ? ` to ${fv.value.end}` : ''}`;
          return fieldText(f.key, fv);
        }),
        fit.verdictLabel, o.url, o.check?.lastCheckedAt?.slice(0, 10) || '', verifyCount(o)]);
    }
    await fsp.writeFile(path.join(dir, 'opportunities.csv'), csv(oppRows));

    const appRows = [['Opportunity', 'Status', 'Deadline', 'Your target date', 'Materials done', 'Materials total', 'Letters', 'Confirmed for submission', 'Submitted']];
    for (const a of apps) {
      const o = snap.opportunities.find((x) => x.id === a.opportunityId);
      const mats = a.materials || [];
      appRows.push([o ? oppName(o) : '(deleted)', APP_STATUS_BY_KEY[a.status]?.label || a.status, fieldText('deadline', o?.fields?.deadline), a.targetDate || '',
        mats.filter((m) => m.status === 'done').length, mats.length,
        (a.recommendations || []).map((r) => `${snap.contacts.find((c) => c.id === r.contactId)?.name || '?'}: ${r.status}`).join('; '),
        a.submission?.confirmedAt?.slice(0, 10) || '', a.submission?.submittedAt?.slice(0, 10) || '']);
    }
    await fsp.writeFile(path.join(dir, 'applications.csv'), csv(appRows));

    const pfRows = [['Title', 'Year', 'Medium', 'Dimensions / duration', 'Caption', 'Project', 'Tags', 'Links', 'Files']];
    for (const p of snap.portfolio) {
      pfRows.push([p.title, p.year, p.medium, p.dimensions, p.caption, snap.projects.find((x) => x.id === p.projectId)?.title || '', (p.tags || []).join('; '),
        (p.links || []).map((l) => l.url).join(' '), (p.files || []).map((f) => f.name).join('; ')]);
    }
    await fsp.writeFile(path.join(dir, 'portfolio.csv'), csv(pfRows));

    const safe = (s) => String(s || 'Untitled').replace(/[/\\:*?"<>|]+/g, '-').slice(0, 80);
    await fsp.mkdir(path.join(dir, 'Proposals'), { recursive: true });
    for (const p of snap.proposals) {
      const body = [`# ${p.title}`, p.tailoredFor ? `_Tailored for ${p.tailoredFor.name}_` : '', ...PROPOSAL_SECTIONS.filter((s) => p.sections?.[s.key]).map((s) => `## ${s.label}\n\n${p.sections[s.key]}`)].filter(Boolean).join('\n\n');
      await fsp.writeFile(path.join(dir, 'Proposals', `${safe(p.title)}.md`), `${body}\n`);
    }
    await fsp.mkdir(path.join(dir, 'Saved text'), { recursive: true });
    for (const s of snap.snippets) await fsp.writeFile(path.join(dir, 'Saved text', `${safe(s.title)}.md`), `# ${s.title}\n\n${s.text || ''}\n`);
    const pr = snap.profile;
    await fsp.writeFile(path.join(dir, 'profile.md'), [
      `# ${pr.name || 'Artist profile'}`, pr.basedIn && `Based in: ${pr.basedIn}`, pr.website && `Website: ${pr.website}`,
      pr.disciplines?.length && `Disciplines: ${pr.disciplines.join(', ')}`, pr.themes?.length && `Themes: ${pr.themes.join(', ')}`,
      pr.goals && `\n## Goals\n\n${pr.goals}`,
    ].filter(Boolean).join('\n') + '\n');
    return { dir };
  }
}
