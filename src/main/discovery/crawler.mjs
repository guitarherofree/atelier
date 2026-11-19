// Finding opportunities in your sources, importing single pages, and re-checking saved ones.
import { EventEmitter } from 'node:events';
import { parseHtml, getLinks, linkContext, findNextPage, urlKey, normalizeUrl } from '../extract/html.mjs';
import { extractOpportunity, listingHints } from '../extract/heuristics.mjs';
import { looksLikeFeed, parseFeed } from './feeds.mjs';
import { buildOpportunity, mergeExtraction, similarNames } from '../opportunities.mjs';
import { hostOf, todayISO, oppName, isoDate } from '../../shared/schema.mjs';
import { FetchError, ERROR_HELP } from '../net/fetcher.mjs';

const NOISE = /\/(tags?|categor(y|ies)|author|page|wp-content|wp-json|feed|login|log-in|signin|sign-in|signup|sign-up|register|account|cart|checkout|about|contact|privacy|terms|cookies?|faq|help|search|newsletter|shop|donate|membership|memberships|pricing|press|jobs?|careers|team|staff|partners|sponsors|advertise|submit-open-call|submit)(\/|$)/i;

function shapeOf(pathname) {
  const trailing = pathname.endsWith('/');
  const segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (!segs.length) return null;
  const last = segs[segs.length - 1];
  const slugish = /[a-z0-9]/i.test(last) && (last.includes('-') || last.includes('_') || /\d/.test(last) || last.length >= 12);
  if (!slugish) return null;
  return { shape: `/${[...segs.slice(0, -1), '*'].join('/')}${trailing ? '/' : ''}`, depth: segs.length };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Guess which links on a listing page are opportunity pages: the most common link "shape". */
export function learnPattern(links, pageUrl) {
  const host = hostOf(pageUrl);
  const groups = new Map();
  for (const l of links) {
    if (hostOf(l.url) !== host) continue;
    let u;
    try { u = new URL(l.url); } catch { continue; }
    if (NOISE.test(u.pathname) || urlKey(l.url) === urlKey(pageUrl)) continue;
    const s = shapeOf(u.pathname);
    if (!s) continue;
    const g = groups.get(s.shape) || { shape: s.shape, depth: s.depth, links: [] };
    g.links.push(l);
    groups.set(s.shape, g);
  }
  let best = null;
  for (const g of groups.values()) {
    if (g.links.length < 3) continue;
    const avgText = g.links.reduce((n, l) => n + Math.min(80, (l.text || '').length), 0) / g.links.length;
    g.score = g.links.length * (avgText >= 15 ? 1.6 : 0.6) * (g.depth >= 2 ? 1.25 : 1);
    if (!best || g.score > best.score) best = g;
  }
  if (!best) return null;
  const pattern = best.shape.replace(/\/$/, '').split('/').map((seg) => (seg === '*' ? '[^/?#]+' : escapeRe(seg))).join('/') + '/?$';
  return { pattern, links: best.links, count: best.links.length };
}

function compile(re) {
  if (!re) return null;
  try { return new RegExp(re, 'i'); } catch { return null; }
}

export function filterLinks(links, source, pageUrl) {
  const inc = compile(source.linkPattern);
  const exc = compile(source.excludePattern);
  const listingKeys = new Set((source.listingUrls || []).map(urlKey).concat(urlKey(pageUrl)));
  return links.filter((l) => {
    if (listingKeys.has(l.key)) return false;
    let u;
    try { u = new URL(l.url); } catch { return false; }
    const target = u.pathname + u.search;
    if (exc && exc.test(target)) return false;
    if (!inc) return false;
    return inc.test(target) && (source.allowOtherHosts || hostOf(l.url) === hostOf(pageUrl) || hostOf(l.url).endsWith(hostOf(pageUrl)));
  });
}

function hintsToExtraction(hints, name) {
  const f = {};
  const add = (k, value, text) => { if (value != null && value !== '') f[k] = { value, text, method: 'listing', confidence: 0.5, evidence: text || String(value) }; };
  add('name', hints.name || name, hints.name || name);
  add('deadline', hints.deadline, hints.deadlineText);
  add('location', hints.location, hints.location);
  add('applicationFee', hints.fee, hints.feeText);
  return { fields: f, pageText: '' };
}

export function extractFromText(text, url, opts = {}) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const html = `<html><body><article><h1>${esc(opts.title || lines[0] || '')}</h1>${lines.slice(opts.title ? 0 : 1).map((l) => `<p>${esc(l)}</p>`).join('')}</article></body></html>`;
  return extractOpportunity(html, url, opts);
}

export class Discovery extends EventEmitter {
  constructor({ db, fetcher, snapshots, log = () => {}, notify = () => {}, instagram = null }) {
    super();
    this.db = db;
    this.fetcher = fetcher;
    this.snapshots = snapshots;
    this.log = log;
    this.notify = notify;
    this.instagram = instagram;
    this.state = { running: false, sources: {}, startedAt: null };
    this.abort = null;
  }

  get settings() { return this.db.settings; }

  #progress(patch) {
    if (patch.sourceId) this.state.sources[patch.sourceId] = { ...(this.state.sources[patch.sourceId] || {}), ...patch };
    this.emit('progress', this.state);
  }

  #seen(sourceId) {
    const d = this.db.state.data.discovery || (this.db.state.data.discovery = {});
    d.seen = d.seen || {};
    d.seen[sourceId] = d.seen[sourceId] || [];
    return d.seen[sourceId];
  }

  #markSeen(sourceId, key) {
    const list = this.#seen(sourceId);
    if (!list.includes(key)) list.push(key);
    if (list.length > 3000) list.splice(0, list.length - 3000);
    this.db.state.save();
  }

  #findExisting(url) {
    const key = urlKey(url);
    return this.db.list('opportunities').find((o) => urlKey(o.url) === key || (o.alsoListed || []).some((a) => urlKey(a.url) === key)) || null;
  }

  #findDuplicate(extraction) {
    const name = extraction.fields?.name?.value;
    const deadline = extraction.fields?.deadline?.value;
    if (!name) return null;
    return this.db.list('opportunities').find((o) => similarNames(oppName(o), name) && (!deadline || !o.fields?.deadline?.value || o.fields.deadline.value === deadline)) || null;
  }

  // ---------------------------------------------------------------- source runs

  async run({ sourceIds = null } = {}) {
    if (this.state.running) return this.state;
    const sources = this.db.list('sources').filter((s) => (sourceIds ? sourceIds.includes(s.id) : s.enabled));
    this.abort = new AbortController();
    this.state = { running: true, startedAt: new Date().toISOString(), sources: {} };
    for (const s of sources) this.state.sources[s.id] = { sourceId: s.id, name: s.name, phase: 'waiting' };
    this.#progress({});
    const queue = [...sources];
    const worker = async () => {
      while (queue.length && !this.abort.signal.aborted) {
        const src = queue.shift();
        try {
          await this.runSource(src, { signal: this.abort.signal });
        } catch (err) {
          this.log('discovery', `source ${src.name} failed: ${err.message}`);
          this.#progress({ sourceId: src.id, phase: 'error', message: err.message });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const totalAdded = Object.values(this.state.sources).reduce((n, s) => n + (s.added || 0), 0);
    this.state.running = false;
    this.state.finishedAt = new Date().toISOString();
    this.db.state.data.discovery = { ...(this.db.state.data.discovery || {}), lastRunAt: this.state.finishedAt };
    this.db.state.save();
    this.#progress({});
    if (totalAdded) this.notify('New opportunities', `${totalAdded} new opportunit${totalAdded === 1 ? 'y' : 'ies'} in Discover.`);
    return this.state;
  }

  cancel() {
    this.abort?.abort();
  }

  #listingQueue(src) {
    const urls = [...(src.listingUrls || [])];
    const p = src.pagination;
    if (p?.template) for (let i = Number(p.from || 2); i <= Number(p.to || 2); i += 1) urls.push(p.template.replace('{page}', String(i)));
    return urls.map((u) => normalizeUrl(u)).filter(Boolean);
  }

  /** Read a source's listing pages and return the candidate links (no detail pages fetched). */
  async collect(src, { signal } = {}) {
    const out = { candidates: new Map(), errors: [], pages: 0, learnedPattern: null, usedPattern: src.linkPattern || null };
    const queue = this.#listingQueue(src).map((url) => ({ url, depth: 0 }));
    const done = new Set();
    const order = src.dateOrder && src.dateOrder !== 'auto' ? src.dateOrder : undefined;
    while (queue.length && !signal?.aborted) {
      const { url, depth } = queue.shift();
      if (done.has(urlKey(url))) continue;
      done.add(urlKey(url));
      let page;
      try {
        page = await this.fetcher.getPage(url, { render: src.render || 'auto', signal, needsText: 200 });
      } catch (err) {
        out.errors.push({ url, kind: err.kind || 'unknown', message: err.message });
        continue;
      }
      out.pages += 1;
      if (src.kind === 'feed' || looksLikeFeed(page.html)) {
        for (const item of parseFeed(page.html)) {
          const u = normalizeUrl(item.url, url);
          if (!u) continue;
          out.candidates.set(urlKey(u), { url: u, key: urlKey(u), text: item.title, context: `${item.title}\n${item.summary}`, hints: { ...listingHints(`${item.title}\n${item.summary}`, { order }), name: item.title }, feedItem: item });
        }
        continue;
      }
      const root = parseHtml(page.html);
      const links = getLinks(root, page.url);
      let matched = filterLinks(links, src, page.url);
      if (!matched.length) {
        const learned = learnPattern(links.filter((l) => !src.excludePattern || !compile(src.excludePattern)?.test(new URL(l.url).pathname)), page.url);
        if (learned) {
          matched = learned.links;
          out.learnedPattern = learned.pattern;
        }
      }
      if (!matched.length && !page.rendered && this.fetcher.renderImpl && (src.render || 'auto') === 'auto') {
        try {
          const rendered = await this.fetcher.getPage(url, { render: 'always', signal });
          const root2 = parseHtml(rendered.html);
          const links2 = getLinks(root2, rendered.url);
          matched = filterLinks(links2, src, rendered.url);
          if (!matched.length) {
            const learned = learnPattern(links2, rendered.url);
            if (learned) { matched = learned.links; out.learnedPattern = learned.pattern; }
          }
        } catch { /* keep going */ }
      }
      for (const l of matched) {
        if (out.candidates.has(l.key)) continue;
        const context = linkContext(l.el);
        out.candidates.set(l.key, { url: l.url, key: l.key, text: l.text, context, hints: listingHints(context, { order }) });
      }
      if (src.followNext !== false && depth + 1 < Number(src.maxPages || 1)) {
        const next = findNextPage(root, page.url);
        if (next && !done.has(urlKey(next))) queue.push({ url: next, depth: depth + 1 });
      }
    }
    return out;
  }

  async runSource(src, { signal, limit } = {}) {
    const started = new Date().toISOString();
    const result = { at: started, found: 0, added: 0, alsoListed: 0, skippedKnown: 0, skippedPast: 0, pending: 0, errors: [], learnedPattern: null, pages: 0 };
    this.#progress({ sourceId: src.id, name: src.name, phase: 'listing', added: 0 });

    if (src.kind === 'instagram') return this.#runInstagram(src, result, signal);

    const col = await this.collect(src, { signal });
    Object.assign(result, { errors: col.errors.slice(0, 8), learnedPattern: col.learnedPattern, pages: col.pages, found: col.candidates.size });
    const today = todayISO();
    const seen = new Set(this.#seen(src.id));
    const fresh = [];
    for (const c of col.candidates.values()) {
      if (this.#findExisting(c.url) || seen.has(c.key)) { result.skippedKnown += 1; continue; }
      if (c.hints?.deadline && c.hints.deadline !== 'rolling' && c.hints.deadline < today) { result.skippedPast += 1; this.#markSeen(src.id, c.key); continue; }
      fresh.push(c);
    }
    const max = limit ?? this.settings.general.newPerSourceLimit ?? 25;
    const batch = fresh.slice(0, max);
    result.pending = fresh.length - batch.length;
    this.#progress({ sourceId: src.id, phase: 'details', total: batch.length, done: 0 });
    let done = 0;
    for (const c of batch) {
      if (signal?.aborted) break;
      const outcome = await this.#importCandidate(src, c, { signal });
      if (outcome === 'added' || outcome?.added) result.added += 1;
      else if (outcome === 'also') result.alsoListed += 1;
      else if (outcome === 'past') result.skippedPast += 1;
      if (outcome?.error) result.errors.push(outcome.error);
      done += 1;
      this.#progress({ sourceId: src.id, done, added: result.added });
    }
    if (!col.pages && col.errors.length) result.status = col.errors[0].kind;
    else if (!col.candidates.size) result.status = 'no-links';
    else result.status = 'ok';
    result.errors = result.errors.slice(0, 10);
    this.db.update('sources', src.id, { lastRun: result });
    this.#progress({ sourceId: src.id, phase: 'done', ...result });
    return result;
  }

  async #importCandidate(src, c, { signal }) {
    const origin = { kind: 'source', sourceId: src.id, sourceName: src.name, listingUrl: src.listingUrls?.[0] || src.homepage };
    try {
      let extraction;
      let finalUrl = c.url;
      if (c.feedItem && src.feedOnly) {
        extraction = extractFromText(c.feedItem.summary, c.url, { title: c.feedItem.title, aggregator: src.aggregator });
      } else {
        const page = await this.fetcher.getPage(c.url, { render: src.render || 'auto', signal });
        finalUrl = page.url || c.url;
        extraction = extractOpportunity(page.html, finalUrl, { hints: c.hints, aggregator: src.aggregator !== false });
      }
      this.#markSeen(src.id, c.key);
      const dl = extraction.fields.deadline?.value;
      if (dl && dl !== 'rolling' && dl < isoDate(new Date(Date.now() - 2 * 86400000))) return 'past';
      const dup = this.#findDuplicate(extraction);
      if (dup) {
        this.db.update('opportunities', dup.id, (o) => {
          o.alsoListed = o.alsoListed || [];
          if (!o.alsoListed.some((a) => urlKey(a.url) === urlKey(finalUrl))) o.alsoListed.push({ sourceId: src.id, sourceName: src.name, url: finalUrl, at: new Date().toISOString() });
        });
        return 'also';
      }
      const opp = this.db.create('opportunities', buildOpportunity({ url: finalUrl, extraction, origin, defaultType: src.defaultType }));
      this.snapshots.add(opp.id, extraction.pageText, { url: finalUrl });
      return 'added';
    } catch (err) {
      this.#markSeen(src.id, c.key);
      // Keep what the listing showed so you can still follow up by hand.
      if (c.hints?.name || c.text) {
        const opp = buildOpportunity({ url: c.url, extraction: hintsToExtraction(c.hints || {}, c.text), origin, defaultType: src.defaultType });
        opp.check = { ...opp.check, lastCheckedAt: null, status: err.kind || 'unknown', error: err.message };
        this.db.create('opportunities', opp);
        return { error: { url: c.url, kind: err.kind, message: err.message }, added: true };
      }
      return { error: { url: c.url, kind: err.kind || 'unknown', message: err.message } };
    }
  }

  /** Try a source without saving anything: which links it finds, and what one page extracts to. */
  async testSource(src) {
    const col = await this.collect({ ...src, maxPages: 1, pagination: null }, {});
    const candidates = [...col.candidates.values()];
    let sample = null;
    const first = candidates[0];
    if (first) {
      try {
        const page = await this.fetcher.getPage(first.url, { render: src.render || 'auto' });
        const ex = extractOpportunity(page.html, page.url, { hints: first.hints, aggregator: src.aggregator !== false });
        sample = { url: page.url, rendered: page.rendered, fields: Object.fromEntries(Object.entries(ex.fields).map(([k, v]) => [k, { value: v.value, method: v.method, confidence: v.confidence }])) };
      } catch (err) {
        sample = { url: first.url, error: err.message, kind: err.kind };
      }
    }
    return {
      pages: col.pages,
      errors: col.errors,
      learnedPattern: col.learnedPattern,
      usedPattern: col.usedPattern,
      links: candidates.slice(0, 80).map((c) => ({ url: c.url, text: c.text, hints: c.hints })),
      count: candidates.length,
      sample,
    };
  }

  async #runInstagram(src, result, signal) {
    const ig = this.settings.instagram || {};
    if (ig.mode !== 'graph' || !this.instagram) {
      result.status = 'manual';
      result.message = ig.mode === 'browser'
        ? 'Browse #artistresidency in the Atelier browser and use Capture to add posts.'
        : 'Instagram is off. Choose a mode in Settings › Instagram.';
      this.db.update('sources', src.id, { lastRun: result });
      this.#progress({ sourceId: src.id, phase: 'done', ...result });
      return result;
    }
    try {
      const posts = await this.instagram.recentMedia({ hashtags: ig.hashtags, signal });
      result.found = posts.length;
      for (const p of posts) {
        if (this.#findExisting(p.permalink)) { result.skippedKnown += 1; continue; }
        if (!/\b(residenc|open call|grant|fellowship|apply|deadline|call for)/i.test(p.caption || '')) continue;
        const ex = extractFromText(p.caption, p.permalink, { aggregator: false });
        const opp = this.db.create('opportunities', buildOpportunity({
          url: p.permalink, extraction: ex, origin: { kind: 'instagram', sourceId: src.id, sourceName: src.name, postedAt: p.timestamp }, fieldOrigin: 'instagram',
        }));
        this.snapshots.add(opp.id, p.caption, { url: p.permalink });
        result.added += 1;
      }
      result.status = 'ok';
    } catch (err) {
      result.status = 'error';
      result.errors.push({ url: src.homepage, kind: err.kind || 'unknown', message: err.message });
    }
    this.db.update('sources', src.id, { lastRun: result });
    this.#progress({ sourceId: src.id, phase: 'done', ...result });
    return result;
  }

  // ---------------------------------------------------------------- single pages

  /**
   * Add an opportunity from a URL you pasted. If the page can't be read, the opportunity is still
   * created so you can fill it in by hand.
   */
  async importUrl(rawUrl, { origin = { kind: 'url' }, status = 'new', hintName } = {}) {
    const url = normalizeUrl(String(rawUrl || '').trim());
    if (!url) throw new FetchError('invalid-url');
    const existing = this.#findExisting(url);
    if (existing) return { opportunity: existing, existed: true };
    try {
      const page = await this.fetcher.getPage(url, { render: 'auto' });
      const extraction = extractOpportunity(page.html, page.url || url, {});
      const opp = this.db.create('opportunities', buildOpportunity({ url: page.url || url, extraction, origin, status }));
      this.snapshots.add(opp.id, extraction.pageText, { url });
      return { opportunity: opp, fieldsFound: Object.keys(extraction.fields).length, rendered: page.rendered };
    } catch (err) {
      const opp = buildOpportunity({ url, extraction: hintsToExtraction({}, hintName || hostOf(url)), origin, status });
      opp.check = { ...opp.check, lastCheckedAt: null, status: err.kind || 'unknown', error: err.message };
      const created = this.db.create('opportunities', opp);
      return { opportunity: created, error: { kind: err.kind, message: err.message, help: ERROR_HELP[err.kind] } };
    }
  }

  /** A page captured from the Atelier browser (after you signed in or passed a site's check). */
  captureHtml({ url, html, status = 'new', origin = { kind: 'capture' } }) {
    const existing = this.#findExisting(url);
    const extraction = extractOpportunity(html, url, {});
    if (existing) {
      const now = new Date().toISOString();
      let merged;
      this.db.update('opportunities', existing.id, (o) => {
        merged = mergeExtraction(o, extraction, { url, now });
        o.check = { ...o.check, lastCheckedAt: now, lastAttemptAt: now, status: 'ok', error: null, changedFields: merged.changed, conflicts: merged.conflicts };
      });
      this.snapshots.add(existing.id, extraction.pageText, { url });
      return { opportunity: this.db.get('opportunities', existing.id), updated: true, merged };
    }
    const opp = this.db.create('opportunities', buildOpportunity({ url, extraction, origin, status, fieldOrigin: 'capture' }));
    this.snapshots.add(opp.id, extraction.pageText, { url });
    return { opportunity: opp, fieldsFound: Object.keys(extraction.fields).length };
  }

  // ---------------------------------------------------------------- re-checks

  async recheck(id, { signal } = {}) {
    const opp = this.db.get('opportunities', id);
    if (!opp?.url) return { status: 'no-url' };
    const src = opp.origin?.sourceId ? this.db.get('sources', opp.origin.sourceId) : null;
    const now = new Date().toISOString();
    let page;
    try {
      page = await this.fetcher.getPage(opp.url, { render: src?.render || 'auto', signal });
    } catch (err) {
      this.db.update('opportunities', id, (o) => {
        o.check = { ...(o.check || {}), lastAttemptAt: now, status: err.kind || 'unknown', error: err.message, failures: (o.check?.failures || 0) + 1 };
      });
      return { status: err.kind, error: err.message, help: ERROR_HELP[err.kind] };
    }
    const extraction = extractOpportunity(page.html, page.url || opp.url, { aggregator: src ? src.aggregator !== false : undefined });
    let merged;
    const pageChanged = this.snapshots.add(id, extraction.pageText, { url: opp.url });
    this.db.update('opportunities', id, (o) => {
      merged = mergeExtraction(o, extraction, { url: opp.url, now });
      o.check = {
        lastCheckedAt: now, lastAttemptAt: now, error: null, failures: 0, pageChanged,
        status: merged.changed.length || merged.conflicts.length || merged.missing.length ? 'changed' : 'ok',
        changedFields: merged.changed, conflicts: merged.conflicts, missing: merged.missing,
      };
    });
    const important = [...merged.changed, ...merged.conflicts].filter((k) => ['deadline', 'applicationFee', 'eligibility', 'fundingType', 'location'].includes(k));
    if (important.length && this.settings.general.notifyChanges && (opp.status === 'saved' || this.#hasApplication(id))) {
      this.notify(`${oppName(opp)} changed`, `Updated on the site: ${important.join(', ').replace(/([A-Z])/g, ' $1').toLowerCase()}. Open Atelier to review.`);
    }
    return { status: 'ok', ...merged, pageChanged };
  }

  #hasApplication(oppId) {
    return this.db.list('applications').some((a) => a.opportunityId === oppId);
  }

  /** Re-check saved opportunities whose last check is older than the interval in Settings. */
  async recheckDue({ limit = 12 } = {}) {
    const days = Number(this.settings.general.recheckEveryDays || 0);
    if (!days || this.rechecking) return [];
    this.rechecking = true;
    try {
      const cutoff = Date.now() - days * 86400000;
      const today = todayISO();
      const due = this.db.list('opportunities').filter((o) => {
        if (!o.url || o.status === 'dismissed') return false;
        if (!(o.status === 'saved' || this.#hasApplication(o.id))) return false;
        const dl = o.fields?.deadline?.value;
        if (dl && dl !== 'rolling' && dl < isoDate(new Date(Date.now() - 7 * 86400000))) return false;
        const last = Date.parse(o.check?.lastCheckedAt || 0) || 0;
        const attempt = Date.parse(o.check?.lastAttemptAt || 0) || 0;
        if (o.check?.error && Date.now() - attempt < 86400000) return false;
        return last < cutoff;
      }).sort((a, b) => String(a.fields?.deadline?.value || '9999').localeCompare(String(b.fields?.deadline?.value || '9999')));
      const out = [];
      for (const o of due.slice(0, limit)) {
        out.push({ id: o.id, ...(await this.recheck(o.id)) });
      }
      if (out.length) this.log('recheck', `re-checked ${out.length} saved opportunities (${today})`);
      return out;
    } finally {
      this.rechecking = false;
    }
  }
}
