// Fetching web pages politely and failing gracefully.
// Every failure is classified so the interface can say what happened and what to try next.
import config from '../../config.mjs';

export const ERROR_HELP = {
  offline: 'Your Mac seems to be offline. Atelier will try again later.',
  timeout: 'The site took too long to answer. It may be slow or down right now.',
  'not-found': 'The page is gone (it may have been moved or taken down).',
  blocked: 'The site refused automated access. Open it in the Atelier browser (you can sign in or pass its check there), then capture the page.',
  'needs-login': 'This page needs you to be signed in. Sign in once in the Atelier browser and Atelier will use that session.',
  'rate-limited': 'The site asked Atelier to slow down. It will try again later.',
  server: 'The site had an internal error. Try again later.',
  'not-html': 'That link is not a web page (it may be a PDF or a download).',
  'invalid-url': 'That doesn’t look like a web address.',
  'too-large': 'The page is unusually large, so Atelier skipped it.',
  empty: 'The page loaded but had almost no readable text (it may need JavaScript).',
  unknown: 'Something went wrong loading the page.',
};

const CHALLENGE = /cf-browser-verification|challenge-platform|just a moment\.\.\.|attention required! \| cloudflare|captcha-delivery|ddos-guard|please verify you are a human|checking your browser/i;

export class FetchError extends Error {
  constructor(kind, message, status = null) {
    super(message || ERROR_HELP[kind] || kind);
    this.kind = kind;
    this.status = status;
  }
}

export function classifyError(err) {
  if (err instanceof FetchError) return err;
  const code = err?.cause?.code || err?.code || '';
  const msg = String(err?.message || err || '');
  if (err?.name === 'AbortError' || /aborted|timeout|ETIMEDOUT|ERR_TIMED_OUT/i.test(`${code} ${msg}`)) return new FetchError('timeout');
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION/i.test(`${code} ${msg}`)) {
    return new FetchError(/ENOTFOUND|NAME_NOT_RESOLVED/i.test(`${code} ${msg}`) ? 'not-found' : 'offline', /ENOTFOUND|NAME_NOT_RESOLVED/i.test(`${code} ${msg}`) ? 'The site’s address could not be found. It may have moved, or your Mac is offline.' : undefined);
  }
  if (/Invalid URL/i.test(msg)) return new FetchError('invalid-url');
  return new FetchError('unknown', `${ERROR_HELP.unknown} (${msg.slice(0, 160)})`);
}

function classifyStatus(status) {
  if (status === 404 || status === 410) return 'not-found';
  if (status === 401) return 'needs-login';
  if (status === 403 || status === 451) return 'blocked';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return status === 503 ? 'blocked' : 'server';
  return 'unknown';
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new FetchError('timeout', 'Cancelled')); }, { once: true });
});

export class Fetcher {
  /**
   * @param {object} o
   * @param {(url:string, init:object) => Promise<Response>} o.fetchImpl
   * @param {(url:string, opts:object) => Promise<{html:string, url:string}>} [o.renderImpl]  JavaScript-capable loader (Electron only)
   */
  constructor({ fetchImpl = globalThis.fetch, renderImpl = null, log = () => {}, perHostDelayMs, timeoutMs } = {}) {
    this.fetchImpl = fetchImpl;
    this.renderImpl = renderImpl;
    this.log = log;
    this.perHostDelayMs = perHostDelayMs ?? config.fetching.perHostDelaySeconds * 1000;
    this.timeoutMs = timeoutMs ?? config.fetching.timeoutSeconds * 1000;
    this.lastHit = new Map();
  }

  async #polite(url, signal) {
    let host;
    try { host = new URL(url).host; } catch { throw new FetchError('invalid-url'); }
    const last = this.lastHit.get(host) || 0;
    const wait = last + this.perHostDelayMs - Date.now();
    this.lastHit.set(host, Math.max(Date.now(), last + this.perHostDelayMs));
    if (wait > 0) await sleep(wait, signal);
  }

  /** Plain HTTP fetch of a page. */
  async fetchText(url, { signal, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } = {}) {
    if (!/^https?:\/\//i.test(url)) throw new FetchError('invalid-url');
    await this.#polite(url, signal);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    signal?.addEventListener('abort', () => ctl.abort(), { once: true });
    let res;
    try {
      res = await this.fetchImpl(url, {
        signal: ctl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': config.fetching.userAgent, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
      });
    } catch (err) {
      clearTimeout(timer);
      throw classifyError(err);
    }
    try {
      const type = res.headers.get('content-type') || '';
      const len = Number(res.headers.get('content-length') || 0);
      if (len > config.fetching.maxPageBytes) throw new FetchError('too-large');
      const text = await res.text();
      if (!res.ok) {
        const kind = CHALLENGE.test(text) ? 'blocked' : classifyStatus(res.status);
        throw new FetchError(kind, `${ERROR_HELP[kind]} (HTTP ${res.status})`, res.status);
      }
      if (type && !/html|xml|text\/plain|json/i.test(type)) throw new FetchError('not-html', `${ERROR_HELP['not-html']} (${type.split(';')[0]})`);
      if (CHALLENGE.test(text.slice(0, 20000)) && text.length < 60000) throw new FetchError('blocked');
      return { url: res.url || url, status: res.status, contentType: type, text };
    } catch (err) {
      throw classifyError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Load a page's HTML. render: 'never' (plain fetch), 'always' (run JavaScript), 'auto' (plain, then
   * JavaScript if the page looks empty or blocked).
   */
  async getPage(url, { render = 'auto', signal, needsText = 400 } = {}) {
    if (render === 'always' && this.renderImpl) return this.#render(url, signal);
    let plain;
    try {
      plain = await this.fetchText(url, { signal });
    } catch (err) {
      if (render === 'auto' && this.renderImpl && ['blocked', 'empty', 'needs-login'].includes(err.kind)) {
        this.log('fetch', `plain fetch ${err.kind} for ${url}; trying with JavaScript`);
        return this.#render(url, signal);
      }
      throw err;
    }
    const visible = visibleTextLength(plain.text);
    if (render === 'auto' && this.renderImpl && visible < needsText) {
      this.log('fetch', `little text (${visible}) at ${url}; trying with JavaScript`);
      try { return await this.#render(url, signal); } catch { /* fall back to the plain page */ }
    }
    if (visible < 40 && !/<a\s/i.test(plain.text)) throw new FetchError('empty');
    return { url: plain.url, html: plain.text, rendered: false };
  }

  async #render(url, signal) {
    await this.#polite(url, signal);
    try {
      const r = await this.renderImpl(url, { signal, timeoutMs: config.fetching.renderWaitSeconds * 1000 + this.timeoutMs });
      if (CHALLENGE.test(r.html.slice(0, 30000)) && visibleTextLength(r.html) < 1500) throw new FetchError('blocked');
      return { url: r.url || url, html: r.html, rendered: true };
    } catch (err) {
      throw classifyError(err);
    }
  }
}

export function visibleTextLength(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}
