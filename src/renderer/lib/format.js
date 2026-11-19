// Formatting helpers for the window.
import { parseISODate, daysUntil } from '../../shared/schema.mjs';

export function fmtDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseISODate(iso) : new Date(iso);
  if (!d || Number.isNaN(d.getTime())) return String(iso);
  return opts.timeStyle || opts.hour ? d.toLocaleString('en-US', opts) : d.toLocaleDateString('en-US', opts);
}

export function fmtShortDate(iso) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseISODate(iso) : new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ago(iso) {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return fmtDate(iso);
}

export function countdown(iso) {
  const n = daysUntil(iso);
  if (n == null) return '';
  if (n < 0) return n === -1 ? 'closed yesterday' : `closed ${-n} days ago`;
  if (n === 0) return 'due today';
  if (n === 1) return 'due tomorrow';
  if (n < 60) return `${n} days left`;
  return `due ${fmtShortDate(iso)}`;
}

export function bytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function plural(n, word, pl = `${word}s`) {
  return `${n} ${n === 1 ? word : pl}`;
}

export function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function titleCase(s) {
  return String(s || '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
