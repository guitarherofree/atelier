// Amounts of money as written on opportunity pages: "$25", "€750.00", "1.250 €", "USD 40", "40 US Dollar (USD)", "FREE".

const SYMBOLS = [
  [/US\$/i, 'USD'], [/CA\$|C\$/i, 'CAD'], [/AU?\$|A\$/i, 'AUD'], [/NZ\$/i, 'NZD'], [/R\$/, 'BRL'], [/MX\$/i, 'MXN'],
  [/\$/, 'USD'], [/€/, 'EUR'], [/£/, 'GBP'], [/¥|円/, 'JPY'], [/₩/, 'KRW'], [/₹/, 'INR'],
];
const CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'MXN', 'BRL', 'SEK', 'NOK', 'DKK', 'ZAR', 'INR', 'KRW', 'CNY', 'TWD', 'HKD', 'SGD', 'PLN', 'CZK', 'HUF', 'ISK', 'TRY', 'ARS', 'COP', 'CLP'];
const WORDS = [
  [/us dollars?|american dollars?/i, 'USD'], [/canadian dollars?/i, 'CAD'], [/australian dollars?/i, 'AUD'], [/dollars?/i, 'USD'],
  [/euros?/i, 'EUR'], [/pounds?( sterling)?/i, 'GBP'], [/swiss francs?|francs?/i, 'CHF'], [/yen/i, 'JPY'], [/pesos?/i, 'MXN'],
  [/kronor|kr\b/i, 'SEK'], [/z[łl]oty/i, 'PLN'],
];

export const FREE = /\b(free( of charge| entry| to apply| to enter| submission)?|no (application |entry |submission |participation )?fees?|without (a |any )?fee|fee[- ]free|there is no (application |entry )?fee|no cost to apply|gratuit[oa]?)\b/i;

export function parseNumber(s) {
  let t = String(s).replace(/['\s]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const NUM = '(\\d{1,3}(?:[.,\']\\d{3})+(?:[.,]\\d{1,2})?(?!\\d)|\\d+(?:[.,]\\d{1,2})?(?!\\d))';

/** The first amount of money in a piece of text, or { amount: 0 } when it says free / no fee. */
export function parseMoney(text, { freeAllowed = true } = {}) {
  const s = String(text || '');
  const found = [];
  const before = new RegExp(`(US\\$|CA\\$|C\\$|AU\\$|A\\$|NZ\\$|R\\$|MX\\$|[$€£¥₩₹]|\\b(?:${CODES.join('|')})\\b)\\s?${NUM}`, 'g');
  const after = new RegExp(`${NUM}\\s?(€|£|\\b(?:${CODES.join('|')})\\b|us dollars?|canadian dollars?|australian dollars?|dollars?|euros?|pounds?|swiss francs?|francs?|yen|pesos?|kronor)`, 'gi');
  let m;
  while ((m = before.exec(s))) {
    const cur = currencyOf(m[1]);
    const amount = parseNumber(m[2]);
    if (amount != null) found.push({ amount, currency: cur, index: m.index, raw: m[0] });
  }
  while ((m = after.exec(s))) {
    const cur = currencyOf(m[2]);
    const amount = parseNumber(m[1]);
    if (amount != null && !found.some((f) => Math.abs(f.index - m.index) < 3)) found.push({ amount, currency: cur, index: m.index, raw: m[0] });
  }
  found.sort((a, b) => a.index - b.index);
  const free = freeAllowed ? FREE.exec(s) : null;
  if (free && (!found.length || free.index < found[0].index)) return { amount: 0, currency: null, raw: free[0] };
  if (found.length) {
    const f = found[0];
    return { amount: f.amount, currency: f.currency, raw: f.raw };
  }
  // A bare "0" or "Fee: 0"
  if (/^\s*0(\.00)?\s*$/.test(s)) return { amount: 0, currency: null, raw: s.trim() };
  return null;
}

function currencyOf(token) {
  const t = String(token || '').trim();
  const upper = t.toUpperCase();
  if (CODES.includes(upper)) return upper;
  for (const [re, code] of SYMBOLS) if (re.test(t)) return code;
  for (const [re, code] of WORDS) if (re.test(t)) return code;
  return null;
}

/** All amounts in a text (used to find stipends and award sizes). */
export function allMoney(text) {
  const out = [];
  let rest = String(text || '');
  for (let i = 0; i < 8; i += 1) {
    const m = parseMoney(rest, { freeAllowed: false });
    if (!m) break;
    out.push(m);
    const at = rest.indexOf(m.raw);
    rest = rest.slice(at + m.raw.length);
  }
  return out;
}
