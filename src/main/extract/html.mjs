// Reading web pages: metadata, structured data, readable lines and links.
import { parse } from 'node-html-parser';

const PARSE_OPTS = { comment: false, blockTextElements: { script: true, noscript: true, style: true, pre: true } };

export function parseHtml(html) {
  return parse(String(html || ''), PARSE_OPTS);
}

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export const clean = (s) => decode(s).replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

export function getMeta(root) {
  const meta = {};
  for (const m of root.querySelectorAll('meta')) {
    const key = (m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop') || '').toLowerCase();
    const content = m.getAttribute('content');
    if (key && content && !(key in meta)) meta[key] = clean(content);
  }
  const title = clean(root.querySelector('title')?.text || '');
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
  const h1 = clean(root.querySelector('h1')?.text || '');
  return {
    title,
    h1,
    ogTitle: meta['og:title'] || meta['twitter:title'] || '',
    description: meta['og:description'] || meta.description || meta['twitter:description'] || '',
    siteName: meta['og:site_name'] || '',
    image: meta['og:image'] || '',
    canonical,
    lang: root.querySelector('html')?.getAttribute('lang') || '',
    raw: meta,
  };
}

export function getJsonLd(root) {
  const out = [];
  for (const s of root.querySelectorAll('script')) {
    if (!/ld\+json/i.test(s.getAttribute('type') || '')) continue;
    try {
      const data = JSON.parse(s.text || s.rawText || '');
      const visit = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) return x.forEach(visit);
        if (x['@graph']) visit(x['@graph']);
        if (x['@type']) out.push(x);
      };
      visit(data);
    } catch { /* ignore broken blocks */ }
  }
  return out;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME', 'TEMPLATE', 'BUTTON', 'SELECT', 'OPTION', 'INPUT', 'TEXTAREA', 'CANVAS', 'VIDEO', 'AUDIO', 'PICTURE', 'IMG']);
const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'TR', 'TABLE', 'TBODY', 'THEAD', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION', 'FORM', 'FIELDSET', 'ADDRESS', 'HR', 'SUMMARY', 'DETAILS', 'CAPTION']);
const JUNK = /(^|[\s_-])(nav|navbar|menu|footer|cookie|consent|banner|newsletter|subscribe|sidebar|share|sharing|social|breadcrumbs?|modal|popup|related|recommend|advert|ads?|promo|signup|login)([\s_-]|$)/i;

/** Remove navigation, footers, cookie banners and similar from a parsed page. */
export function stripChrome(root) {
  for (const el of root.querySelectorAll('nav, footer, script, style, noscript, svg, iframe, form, [role="navigation"], [role="banner"], [aria-hidden="true"]')) el.remove();
  for (const el of root.querySelectorAll('[class], [id]')) {
    const tag = el.tagName;
    if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN' || tag === 'ARTICLE') continue;
    const sig = `${el.getAttribute('class') || ''} ${el.getAttribute('id') || ''}`;
    if (JUNK.test(sig) && (el.text || '').length < 4000) el.remove();
  }
  return root;
}

export function mainNode(root) {
  const body = root.querySelector('body') || root;
  const total = clean(body.text).length || 1;
  let best = null;
  let bestLen = 0;
  for (const sel of ['main', 'article', '[role="main"]', '.entry-content', '.post-content', '.single-content', '#content', '.content', '#main', '.main']) {
    for (const el of root.querySelectorAll(sel)) {
      const len = clean(el.text).length;
      if (len > bestLen) { best = el; bestLen = len; }
    }
  }
  if (best && bestLen > 300 && bestLen > total * 0.25) return best;
  return body;
}

/** Readable lines with their kind: h (heading), dt, dd, cell, li, p. */
export function toLines(node) {
  const lines = [];
  let cur = '';
  let kind = 'p';
  const flush = () => {
    const t = clean(cur);
    if (t) lines.push({ text: t, kind });
    cur = '';
    kind = 'p';
  };
  const kindOf = (tag) => {
    if (/^H[1-6]$/.test(tag)) return 'h';
    if (tag === 'DT') return 'dt';
    if (tag === 'DD') return 'dd';
    if (tag === 'LI') return 'li';
    if (tag === 'TR') return 'cell';
    return null;
  };
  const INLINE_GAP = new Set(['A', 'SPAN', 'TIME', 'SMALL', 'LABEL', 'STRONG', 'B', 'EM', 'I']);
  const walk = (n, parentKind) => {
    if (n.nodeType === 3) { cur += n.text; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (!tag || SKIP.has(tag)) return;
    if (tag === 'BR') { const k = kind; flush(); kind = k; return; }
    const block = BLOCK.has(tag);
    const own = kindOf(tag) || parentKind;
    if (block) { flush(); kind = own || 'p'; }
    for (const c of n.childNodes) walk(c, own);
    if (tag === 'TD' || tag === 'TH') cur += ' | ';
    else if (INLINE_GAP.has(tag) && cur && !/\s$/.test(cur)) cur += ' ';
    if (block) { flush(); kind = parentKind || 'p'; }
  };
  walk(node, null);
  // Table rows come out as "a | b |": tidy the trailing separator.
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s*\|\s*$/, '').replace(/\s+([,.;:!?)])/g, '$1').replace(/([(])\s+/g, '$1').trim() })).filter((l) => l.text);
}

const ASSET = /\.(jpe?g|png|gif|webp|svg|pdf|zip|mp3|mp4|mov|docx?|xlsx?|css|js)(\?|$)/i;

export function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

/** A comparison key for the same page under slightly different URLs. */
export function urlKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const p = u.pathname.replace(/\/+$/, '') || '/';
    const q = [...u.searchParams.entries()].filter(([k]) => !/^(utm_|fbclid|gclid)/i.test(k)).sort().map(([k, v]) => `${k}=${v}`).join('&');
    return `${host}${p}${q ? `?${q}` : ''}`;
  } catch {
    return String(url || '').toLowerCase();
  }
}

export function getLinks(root, baseUrl) {
  const out = [];
  const seen = new Set();
  for (const a of root.querySelectorAll('a[href]')) {
    const url = normalizeUrl(a.getAttribute('href'), baseUrl);
    if (!url || ASSET.test(url)) continue;
    const key = urlKey(url);
    const text = clean(a.text) || clean(a.getAttribute('title') || a.getAttribute('aria-label') || '');
    if (seen.has(key)) {
      const prev = out.find((l) => l.key === key);
      if (prev && text.length > prev.text.length) prev.text = text;
      continue;
    }
    seen.add(key);
    out.push({ url, key, text, el: a });
  }
  return out;
}

/** The text of the card or row around a link on a listing page (for quick hints). */
export function linkContext(a, maxLen = 600) {
  let el = a;
  const own = a.getAttribute('href');
  for (let i = 0; i < 6 && el.parentNode; i += 1) {
    const p = el.parentNode;
    if (!p.tagName || p.tagName === 'BODY') break;
    const t = clean(p.text);
    if (t.length > maxLen) break;
    // Stop before a container that also holds other opportunities' links.
    const others = new Set(p.querySelectorAll('a[href]').map((x) => x.getAttribute('href')).filter((h) => h && h !== own && !h.startsWith('#')));
    if (others.size >= 2 && el !== a) break;
    el = p;
    if (['LI', 'ARTICLE', 'TR'].includes(p.tagName)) break;
  }
  return el === a ? clean(a.text) : toLines(el).map((l) => l.text).join('\n');
}

export function findNextPage(root, baseUrl) {
  const rel = root.querySelector('link[rel="next"]')?.getAttribute('href') || root.querySelector('a[rel="next"]')?.getAttribute('href');
  if (rel) return normalizeUrl(rel, baseUrl);
  for (const a of root.querySelectorAll('a[href]')) {
    const t = clean(a.text).toLowerCase();
    const label = (a.getAttribute('aria-label') || '').toLowerCase();
    if (/^(next|next page|older|more|›|»|→|load more)$/.test(t) || /next page/.test(label)) {
      const u = normalizeUrl(a.getAttribute('href'), baseUrl);
      if (u && u !== baseUrl) return u;
    }
  }
  return null;
}
