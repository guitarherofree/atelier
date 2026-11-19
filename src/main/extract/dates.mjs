// Dates as written on opportunity pages: "Dec. 1, 2026", "1 December 2026", "01.12.2026", "2026-12-01",
// "June 21, 2026 at 22:00 UTC", ranges like "15 October 2025 – 1 April 2026", plus a few other languages.
import * as chrono from 'chrono-node';
import { isoDate } from '../../shared/schema.mjs';

const PARSERS = ['en', 'es', 'fr', 'de', 'pt', 'nl', 'it'].map((k) => chrono[k]).filter((p) => p && typeof p.parse === 'function');

function iso(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return isoDate(dt);
}

function numeric(text, order) {
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (m) return { iso: iso(+m[1], +m[2], +m[3]), hasYear: true, index: m.index, raw: m[0] };
  m = /\b(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const a = +m[1]; const b = +m[3]; const y = +m[4];
    let dmy = order === 'dmy' || m[2] === '.';
    if (a > 12) dmy = true;
    else if (b > 12) dmy = false;
    const out = dmy ? iso(y, b, a) : iso(y, a, b);
    if (out) return { iso: out, hasYear: true, index: m.index, raw: m[0] };
  }
  return null;
}

/**
 * The first date in a piece of text.
 * @returns {{ iso, hasYear, raw, end? } | null}
 */
export function parseDate(text, { ref = new Date(), order = 'mdy', forward = true } = {}) {
  const s = String(text || '').replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ');
  if (!s.trim()) return null;
  const num = numeric(s, order);
  let best = null;
  for (const p of PARSERS) {
    let results;
    try { results = p.parse(s, ref, { forwardDate: forward }); } catch { continue; }
    const r = results.find((x) => x.start.isCertain('day') && x.start.isCertain('month'));
    if (r) {
      const d = r.start.date();
      const end = r.end && r.end.isCertain('day') ? isoDate(r.end.date()) : null;
      best = { iso: isoDate(d), hasYear: r.start.isCertain('year'), raw: r.text, index: r.index, end };
      break;
    }
  }
  if (num && (!best || num.index <= best.index)) return { iso: num.iso, hasYear: true, raw: num.raw, end: null };
  return best;
}

/** All dates in a piece of text, in order. */
export function parseAllDates(text, opts = {}) {
  const s = String(text || '');
  const out = [];
  let rest = s;
  let offset = 0;
  for (let i = 0; i < 6; i += 1) {
    const d = parseDate(rest, opts);
    if (!d) break;
    const at = rest.indexOf(d.raw);
    out.push({ ...d, index: offset + Math.max(0, at) });
    if (d.end) out.push({ iso: d.end, hasYear: d.hasYear, raw: d.raw, index: offset + Math.max(0, at) + 1 });
    const cut = at >= 0 ? at + d.raw.length : rest.length;
    rest = rest.slice(cut);
    offset += cut;
  }
  return out;
}

export function parseRange(text, opts = {}) {
  const all = parseAllDates(text, opts);
  if (!all.length) return null;
  const isos = all.map((d) => d.iso).filter(Boolean).sort();
  return { start: isos[0], end: isos[isos.length - 1] !== isos[0] ? isos[isos.length - 1] : null };
}

export const ROLLING = /\b(rolling( basis| applications?| deadline)?|ongoing|no deadline|open (all year|year[- ]round|indefinitely)|any ?time|permanent call|apply at any time|sin fecha l[ií]mite)\b/i;
