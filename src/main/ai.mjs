// Optional AI assistance. Off by default. When you turn it on, Atelier sends only the text needed for
// the action you clicked (never your whole library) to the provider you chose:
//   anthropic  Claude API with your own key (stored in the Keychain)
//   ollama     a model running on your own Mac — nothing leaves the computer
//   openai     any OpenAI-compatible server you point it at (LM Studio, a local server, …)
// Each request is logged (time, provider, purpose, size — not the content) in logs/ai-activity.jsonl.
import fs from 'node:fs';
import path from 'node:path';

export class AiError extends Error {
  constructor(message, kind = 'error') {
    super(message);
    this.kind = kind;
  }
}

export const PROVIDER_LABELS = { off: 'Off', anthropic: 'Claude (Anthropic API)', ollama: 'Ollama (on this Mac)', openai: 'OpenAI-compatible server' };

export function parseJsonLoose(text) {
  const s = String(text || '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const body = fenced ? fenced[1] : s;
  try { return JSON.parse(body); } catch {}
  const starts = [body.indexOf('{'), body.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  if (end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

export class Assistant {
  constructor({ db, keychain, logDir, fetchImpl = globalThis.fetch }) {
    this.db = db;
    this.keychain = keychain;
    this.logFile = path.join(logDir, 'ai-activity.jsonl');
    this.fetchImpl = fetchImpl;
  }

  get settings() { return this.db.settings.ai; }
  get provider() { return this.settings.provider || 'off'; }
  get enabled() { return this.provider !== 'off'; }

  #log(entry) {
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
    } catch {}
  }

  describe() {
    const p = this.provider;
    if (p === 'anthropic') return { provider: p, label: PROVIDER_LABELS[p], model: this.settings.anthropic.model, leavesMac: true, destination: 'api.anthropic.com' };
    if (p === 'ollama') {
      const host = safeHost(this.settings.ollama.baseUrl);
      return { provider: p, label: PROVIDER_LABELS[p], model: this.settings.ollama.model, leavesMac: !isLocal(host), destination: host };
    }
    if (p === 'openai') {
      const host = safeHost(this.settings.openai.baseUrl);
      return { provider: p, label: PROVIDER_LABELS[p], model: this.settings.openai.model, leavesMac: !isLocal(host), destination: host };
    }
    return { provider: 'off', label: 'Off', leavesMac: false };
  }

  async #post(url, body, headers, { timeoutMs = 120000 } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    } catch (err) {
      throw new AiError(err.name === 'AbortError' ? 'The AI provider took too long to answer.' : `Couldn’t reach ${safeHost(url)} (${err.cause?.code || err.message}).`, 'network');
    } finally {
      clearTimeout(t);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text.slice(0, 200);
      if (res.status === 401 || res.status === 403) throw new AiError(`The provider rejected the key (${msg}).`, 'auth');
      if (res.status === 429) throw new AiError('The provider is rate-limiting requests. Try again in a minute.', 'rate');
      if (res.status === 404) throw new AiError(`Not found (${msg}). Check the model name in Settings › AI.`, 'config');
      throw new AiError(`The provider returned an error (${res.status}: ${msg}).`, 'provider');
    }
    return json;
  }

  /**
   * One request. `purpose` is recorded in the activity log.
   * @returns {Promise<{ text: string, json: any, sources?: Array }>}
   */
  async complete({ system, prompt, json = false, maxTokens = 2000, purpose = 'request', webSearch = false }) {
    const p = this.provider;
    if (p === 'off') throw new AiError('AI assistance is off. Turn it on in Settings › AI.', 'off');
    const chars = (system || '').length + (prompt || '').length;
    const started = Date.now();
    try {
      let text = '';
      let sources = [];
      if (p === 'anthropic') {
        const key = await this.keychain.get('anthropic');
        if (!key) throw new AiError('Add your Claude API key in Settings › AI.', 'auth');
        const body = {
          model: this.settings.anthropic.model,
          max_tokens: maxTokens,
          system: json ? `${system || ''}\n\nRespond with JSON only, no commentary.` : system,
          messages: [{ role: 'user', content: prompt }],
        };
        if (webSearch) body.tools = [{ type: this.settings.anthropic.webSearchTool || 'web_search_20250305', name: 'web_search', max_uses: 6 }];
        const res = await this.#post('https://api.anthropic.com/v1/messages', body, { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { timeoutMs: webSearch ? 240000 : 120000 });
        for (const block of res.content || []) {
          if (block.type === 'text') {
            text += block.text;
            for (const c of block.citations || []) if (c.url) sources.push({ url: c.url, title: c.title });
          }
          if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
            for (const r of block.content) if (r.url) sources.push({ url: r.url, title: r.title });
          }
        }
      } else if (p === 'ollama') {
        if (webSearch) throw new AiError('Web search needs the Claude API provider.', 'config');
        const base = this.settings.ollama.baseUrl.replace(/\/$/, '');
        const res = await this.#post(`${base}/api/chat`, {
          model: this.settings.ollama.model,
          stream: false,
          format: json ? 'json' : undefined,
          messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
          options: { num_predict: maxTokens },
        }, {}, { timeoutMs: 300000 });
        text = res?.message?.content || '';
      } else if (p === 'openai') {
        if (webSearch) throw new AiError('Web search needs the Claude API provider.', 'config');
        const key = await this.keychain.get('openai');
        const base = this.settings.openai.baseUrl.replace(/\/$/, '');
        const res = await this.#post(`${base}/chat/completions`, {
          model: this.settings.openai.model,
          max_tokens: maxTokens,
          messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
        }, key ? { authorization: `Bearer ${key}` } : {}, { timeoutMs: 300000 });
        text = res?.choices?.[0]?.message?.content || '';
      }
      this.#log({ provider: p, purpose, charsSent: chars, ok: true, ms: Date.now() - started, webSearch });
      const seen = new Set();
      sources = sources.filter((s) => (seen.has(s.url) ? false : seen.add(s.url)));
      return { text, json: json ? parseJsonLoose(text) : null, sources };
    } catch (err) {
      this.#log({ provider: p, purpose, charsSent: chars, ok: false, error: err.message, ms: Date.now() - started });
      throw err instanceof AiError ? err : new AiError(err.message);
    }
  }

  async test() {
    const r = await this.complete({ prompt: 'Reply with the single word: ready', maxTokens: 20, purpose: 'connection test' });
    return { ok: /ready/i.test(r.text), reply: r.text.slice(0, 80) };
  }

  readLog(limit = 200) {
    try {
      const lines = fs.readFileSync(this.logFile, 'utf8').trim().split('\n');
      return lines.slice(-limit).reverse().map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return String(url || ''); }
}

function isLocal(host) {
  return /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host || '');
}
