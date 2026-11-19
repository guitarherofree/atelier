// Turning extracted details into stored opportunities, and merging later re-checks without ever
// overwriting what you typed or confirmed. Pure functions (no file or network access).
import { OPP_FIELDS, sameValue } from '../shared/schema.mjs';

const ORIGIN_FROM_METHOD = { listing: 'listing', jsonld: 'jsonld', ai: 'ai', capture: 'capture', feed: 'feed', search: 'search', instagram: 'instagram' };

export function toFieldValue(ex, { url, now, origin }) {
  return {
    value: ex.value,
    text: ex.text,
    origin: origin || ORIGIN_FROM_METHOD[ex.method] || 'extracted',
    method: ex.method,
    confidence: ex.confidence,
    evidence: ex.evidence,
    sourceUrl: url,
    extractedAt: now,
    checkedAt: now,
  };
}

export function excerpt(text, n = 8000) {
  return String(text || '').slice(0, n);
}

/** A new opportunity record from an extraction. */
export function buildOpportunity({ url, extraction, origin, status = 'new', now = new Date().toISOString(), defaultType = '', fieldOrigin }) {
  const fields = {};
  for (const [key, ex] of Object.entries(extraction?.fields || {})) {
    if (ex.value == null || ex.value === '') continue;
    fields[key] = toFieldValue(ex, { url, now, origin: fieldOrigin });
  }
  if (!fields.type && defaultType) fields.type = { value: defaultType, origin: 'listing', method: 'source default', confidence: 0.5, sourceUrl: url, extractedAt: now, checkedAt: now, evidence: 'Default type for this source' };
  return {
    url,
    status,
    origin: { ...origin, discoveredAt: now },
    fields,
    custom: [],
    tags: [],
    notes: '',
    calendar: status === 'saved' ? true : undefined,
    pageExcerpt: excerpt(extraction?.pageText),
    check: {
      lastCheckedAt: extraction ? now : null,
      lastAttemptAt: now,
      status: extraction ? 'ok' : 'unreachable',
      error: null,
      changedFields: [],
      conflicts: [],
    },
    alsoListed: [],
    geo: null,
  };
}

/**
 * Merge a fresh extraction into an existing opportunity.
 * - Details still extracted automatically and never confirmed are updated (the old value is kept as `previous`).
 * - Details you typed or confirmed are never changed; if the site now differs, it is recorded as `siteValue`.
 * - Details that disappear from the page are flagged.
 * @returns {{ changed: string[], conflicts: string[], added: string[], missing: string[] }}
 */
export function mergeExtraction(opp, extraction, { url, now = new Date().toISOString() } = {}) {
  const result = { changed: [], conflicts: [], added: [], missing: [] };
  const fresh = extraction.fields || {};
  opp.fields = opp.fields || {};
  for (const def of OPP_FIELDS) {
    const key = def.key;
    const ex = fresh[key];
    const fv = opp.fields[key];
    if (!ex || ex.value == null || ex.value === '') {
      if (fv && fv.origin !== 'manual' && ['extracted', 'jsonld', 'listing'].includes(fv.origin) && fv.sourceUrl === url && (fv.confidence ?? 0) >= 0.6) {
        if (!fv.missingOnSiteAt) { fv.missingOnSiteAt = now; result.missing.push(key); }
      }
      continue;
    }
    if (!fv) {
      opp.fields[key] = toFieldValue(ex, { url, now });
      result.added.push(key);
      continue;
    }
    delete fv.missingOnSiteAt;
    const userOwned = fv.origin === 'manual' || fv.verified;
    if (sameValue(fv.value, ex.value)) {
      fv.checkedAt = now;
      if (fv.siteValue) delete fv.siteValue;
      continue;
    }
    if (userOwned) {
      // Never overwrite you; record what the site says now.
      if (!fv.siteValue || !sameValue(fv.siteValue.value, ex.value)) result.conflicts.push(key);
      fv.siteValue = { value: ex.value, text: ex.text, evidence: ex.evidence, seenAt: now, sourceUrl: url };
      fv.checkedAt = now;
      continue;
    }
    // A weaker reading of the page shouldn't replace a stronger one from the same check.
    if ((ex.confidence ?? 0) + 0.15 < (fv.confidence ?? 0) && fv.sourceUrl === url && ex.method !== fv.method) {
      fv.checkedAt = now;
      continue;
    }
    if (key === 'description') {
      // Descriptions change wording often; the page history shows those edits.
      Object.assign(fv, toFieldValue(ex, { url, now }));
      continue;
    }
    fv.previous = { value: fv.value, text: fv.text, at: fv.extractedAt };
    Object.assign(fv, toFieldValue(ex, { url, now }), { changedAt: now, previous: fv.previous });
    result.changed.push(key);
  }
  opp.pageExcerpt = excerpt(extraction.pageText);
  return result;
}

/** You typed a value: it becomes yours and stops being overwritten. */
export function setManualField(opp, key, { value, text }, now = new Date().toISOString()) {
  opp.fields = opp.fields || {};
  const prev = opp.fields[key];
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
    delete opp.fields[key];
    return;
  }
  opp.fields[key] = {
    value,
    text: text ?? undefined,
    origin: 'manual',
    method: 'you',
    confidence: 1,
    sourceUrl: prev?.sourceUrl || null,
    extractedAt: prev?.extractedAt || null,
    enteredAt: now,
    checkedAt: now,
    verified: true,
    verifiedAt: now,
    replaced: prev && prev.origin !== 'manual' ? { value: prev.value, origin: prev.origin, sourceUrl: prev.sourceUrl } : prev?.replaced,
  };
}

export function verifyField(opp, key, now = new Date().toISOString()) {
  const fv = opp.fields?.[key];
  if (!fv) return false;
  fv.verified = true;
  fv.verifiedAt = now;
  delete fv.missingOnSiteAt;
  return true;
}

/** Take the site's newer value over yours (after a conflict). */
export function acceptSiteValue(opp, key, now = new Date().toISOString()) {
  const fv = opp.fields?.[key];
  if (!fv?.siteValue) return false;
  const sv = fv.siteValue;
  opp.fields[key] = {
    value: sv.value, text: sv.text, origin: 'extracted', method: 'recheck', confidence: 0.8, evidence: sv.evidence,
    sourceUrl: sv.sourceUrl, extractedAt: sv.seenAt, checkedAt: now, verified: true, verifiedAt: now,
    previous: { value: fv.value, text: fv.text, at: fv.enteredAt || fv.extractedAt },
  };
  return true;
}

export function keepYourValue(opp, key, now = new Date().toISOString()) {
  const fv = opp.fields?.[key];
  if (!fv?.siteValue) return false;
  fv.dismissedSiteValue = { ...fv.siteValue, dismissedAt: now };
  delete fv.siteValue;
  return true;
}

/** Undo a change the site made (go back to the previous extracted value). */
export function revertChange(opp, key) {
  const fv = opp.fields?.[key];
  if (!fv?.previous) return false;
  fv.value = fv.previous.value;
  fv.text = fv.previous.text;
  delete fv.changedAt;
  delete fv.previous;
  return true;
}

export function normalizeName(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(open call|call for (artists|applications|entries)|the|a|an|for|of|and|&|20\d\d|residency|residencies|program(me)?|artist|artists|in)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function similarNames(a, b) {
  const x = new Set(normalizeName(a).split(' ').filter(Boolean));
  const y = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (!x.size || !y.size) return false;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter += 1;
  return inter / Math.max(x.size, y.size) >= 0.8;
}
