// Secrets (API keys, tokens) live in the macOS Keychain, never in Atelier's data files or backups.
// On other systems (development and tests only) they fall back to a private file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const SECRETS = {
  github: { service: 'Atelier GitHub Token', label: 'GitHub update token' },
  anthropic: { service: 'Atelier Claude API Key', label: 'Claude API key' },
  openai: { service: 'Atelier OpenAI-compatible Key', label: 'API key for an OpenAI-compatible server' },
  brave: { service: 'Atelier Brave Search Key', label: 'Brave Search API key' },
  instagram: { service: 'Atelier Instagram Token', label: 'Instagram Graph API token' },
};
const ACCOUNT = 'atelier';

export class Keychain {
  constructor(fallbackDir) {
    this.fallbackDir = fallbackDir;
    this.cache = new Map();
  }

  #file(name) {
    return path.join(this.fallbackDir, `${name}.secret`);
  }

  async get(name) {
    const def = SECRETS[name];
    if (!def) throw new Error(`Unknown secret ${name}`);
    if (this.cache.has(name)) return this.cache.get(name);
    let value = null;
    if (process.platform === 'darwin') {
      try {
        const { stdout } = await run('/usr/bin/security', ['find-generic-password', '-s', def.service, '-a', ACCOUNT, '-w']);
        value = stdout.trim() || null;
      } catch { value = null; }
    } else {
      try { value = (await fsp.readFile(this.#file(name), 'utf8')).trim() || null; } catch { value = null; }
    }
    this.cache.set(name, value);
    return value;
  }

  async has(name) {
    return Boolean(await this.get(name));
  }

  async set(name, value) {
    const def = SECRETS[name];
    if (!def) throw new Error(`Unknown secret ${name}`);
    const v = String(value || '').trim();
    if (!v) return this.clear(name);
    if (process.platform === 'darwin') {
      await run('/usr/bin/security', ['add-generic-password', '-U', '-s', def.service, '-a', ACCOUNT, '-l', def.service, '-w', v]);
    } else {
      fs.mkdirSync(this.fallbackDir, { recursive: true });
      await fsp.writeFile(this.#file(name), v, { mode: 0o600 });
    }
    this.cache.set(name, v);
    return true;
  }

  async clear(name) {
    const def = SECRETS[name];
    if (!def) throw new Error(`Unknown secret ${name}`);
    if (process.platform === 'darwin') {
      try { await run('/usr/bin/security', ['delete-generic-password', '-s', def.service, '-a', ACCOUNT]); } catch {}
    } else {
      await fsp.rm(this.#file(name), { force: true });
    }
    this.cache.set(name, null);
    return true;
  }

  async status() {
    const out = {};
    for (const name of Object.keys(SECRETS)) out[name] = await this.has(name);
    return out;
  }
}
