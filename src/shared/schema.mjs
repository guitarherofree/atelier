// Shared definitions used by both the app process and the window.
// Everything here is plain data and pure functions (no Node or DOM access).

export const OPP_TYPES = ['Residency', 'Grant', 'Fellowship', 'Open call', 'Prize / award', 'Commission', 'Other'];
export const OPP_MODES = ['In person', 'Online', 'Hybrid'];
// What a residency asks of you. "Time and space" means no project, output or public programme is required.
export const RESIDENCY_FOCUS = ['Time and space', 'Project-based', 'Public engagement', 'Work exchange'];

// The details captured for every opportunity, in display order.
// `important` fields are flagged for verification first.
export const OPP_FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'organization', label: 'Organization', type: 'text' },
  { key: 'type', label: 'Type', type: 'enum', options: OPP_TYPES },
  { key: 'location', label: 'Location', type: 'text', important: true },
  { key: 'mode', label: 'Format', type: 'enum', options: OPP_MODES, help: 'In person, online, or both' },
  { key: 'focus', label: 'Residency focus', type: 'enum', options: RESIDENCY_FOCUS, help: 'Time and space: studio time with no project, output or public programme required (an optional talk or open studio is fine). Project-based: you carry out a proposed project or must produce, exhibit or donate work. Public engagement: teaching, workshops or community programmes are required. Work exchange: you work set hours in return.' },
  { key: 'discipline', label: 'Disciplines', type: 'list' },
  { key: 'eligibility', label: 'Eligibility', type: 'longtext', important: true },
  { key: 'openingDate', label: 'Opens', type: 'date' },
  { key: 'deadline', label: 'Deadline', type: 'deadline', important: true },
  { key: 'programDates', label: 'Program dates', type: 'daterange' },
  { key: 'duration', label: 'Length', type: 'text' },
  { key: 'applicationFee', label: 'Application fee', type: 'money', important: true },
  { key: 'programFee', label: 'Program fee (paid by artist)', type: 'money' },
  { key: 'fundingType', label: 'Funding', type: 'list', important: true },
  { key: 'fundingAmount', label: 'Award / stipend', type: 'text' },
  { key: 'fundingRestrictions', label: 'Funding restrictions', type: 'longtext' },
  { key: 'workSamples', label: 'Work samples', type: 'longtext' },
  { key: 'recommendations', label: 'Recommendation letters', type: 'text' },
  { key: 'requirements', label: 'Other requirements', type: 'list' },
  { key: 'applyUrl', label: 'Application link', type: 'url' },
  { key: 'website', label: 'Organizer website', type: 'url' },
  { key: 'contact', label: 'Contact', type: 'text' },
  { key: 'language', label: 'Language', type: 'text' },
  { key: 'description', label: 'Description', type: 'longtext' },
];
export const FIELD_BY_KEY = Object.fromEntries(OPP_FIELDS.map((f) => [f.key, f]));

export const FUNDING_KINDS = [
  'Fully funded', 'Stipend', 'Travel', 'Housing', 'Meals', 'Materials', 'Production budget', 'Grant', 'Artist fee', 'Prize money',
  'No funding', 'Self-funded (fee to attend)',
];

export const REQUIREMENT_KINDS = [
  'CV / résumé', 'Artist statement', 'Project proposal', 'Bio', 'Budget', 'Letter of intent', 'Cover letter', 'Work samples',
  'Recommendation letters', 'Interview', 'Writing sample', 'Timeline / work plan', 'Proof of residence', 'ID / passport copy',
  'Artist talk / open studio', 'Exhibition at end', 'Community engagement',
];

export const DISCIPLINES = [
  'Visual arts', 'Painting', 'Drawing', 'Sculpture', 'Installation', 'Photography', 'Film / video', 'Sound art', 'Music',
  'Composition', 'Performance', 'Dance', 'Theatre', 'Writing', 'Poetry', 'New media', 'Digital art', 'Ceramics', 'Textiles',
  'Printmaking', 'Craft', 'Design', 'Architecture', 'Curating', 'Research', 'Social practice', 'Interdisciplinary',
];

export const OPP_STATUSES = {
  new: 'New',
  saved: 'Saved',
  dismissed: 'Dismissed',
};

export const APP_STATUSES = [
  { key: 'interested', label: 'Interested', group: 'active' },
  { key: 'preparing', label: 'Preparing', group: 'active' },
  { key: 'review', label: 'Ready for review', group: 'active' },
  { key: 'submitted', label: 'Submitted', group: 'waiting' },
  { key: 'waitlisted', label: 'Waitlisted', group: 'waiting' },
  { key: 'accepted', label: 'Accepted', group: 'done' },
  { key: 'declined', label: 'Not selected', group: 'done' },
  { key: 'withdrawn', label: 'Withdrawn', group: 'done' },
  { key: 'skipped', label: 'Not applying', group: 'done' },
];
export const APP_STATUS_BY_KEY = Object.fromEntries(APP_STATUSES.map((s) => [s.key, s]));

export const MATERIAL_TYPES = [
  { key: 'cv', label: 'CV / résumé' },
  { key: 'statement', label: 'Artist statement' },
  { key: 'bio', label: 'Bio' },
  { key: 'proposal', label: 'Project proposal' },
  { key: 'samples', label: 'Work samples' },
  { key: 'budget', label: 'Budget' },
  { key: 'letters', label: 'Recommendation letters' },
  { key: 'letter-of-intent', label: 'Letter of intent' },
  { key: 'timeline', label: 'Timeline / work plan' },
  { key: 'fee', label: 'Application fee' },
  { key: 'other', label: 'Other' },
];
export const MATERIAL_STATUS = [
  { key: 'todo', label: 'To do' },
  { key: 'drafting', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

export const REC_STATUSES = [
  { key: 'to-ask', label: 'To ask' },
  { key: 'asked', label: 'Asked' },
  { key: 'agreed', label: 'Agreed' },
  { key: 'submitted', label: 'Letter sent' },
  { key: 'declined', label: 'Declined' },
];

export const PROPOSAL_SECTIONS = [
  { key: 'summary', label: 'Summary', hint: 'One or two sentences: what you will make or research.' },
  { key: 'description', label: 'Project description', hint: 'What the project is, why now, and how it connects to your practice.' },
  { key: 'residencyUse', label: 'Planned use of residency time', hint: 'What you will do day to day or week to week, and why this place.' },
  { key: 'timeline', label: 'Timeline / work plan', hint: 'Phases or weeks, with milestones.' },
  { key: 'outcomes', label: 'Outcomes and sharing', hint: 'What will exist at the end; open studio, talk, workshop, recording, exhibition.' },
  { key: 'specialRequirements', label: 'Special requirements', hint: 'Space, equipment, technical needs, accessibility, family or schedule needs.' },
  { key: 'budget', label: 'Budget', hint: 'Optional: materials, travel, equipment, fees.' },
];

export const SNIPPET_KINDS = [
  { key: 'bio', label: 'Bio' },
  { key: 'statement', label: 'Artist statement' },
  { key: 'cv', label: 'CV' },
  { key: 'answer', label: 'Application answer' },
  { key: 'other', label: 'Other text' },
];

// ---------------------------------------------------------------- dates

const DAY = 86400000;

export function todayISO(now = new Date()) {
  return isoDate(now);
}

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** Whole days from today until an ISO date (negative when past). */
export function daysUntil(iso, now = new Date()) {
  const d = parseISODate(iso);
  if (!d) return null;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - t) / DAY);
}

export function deadlineOf(opp, now = new Date()) {
  const v = opp?.fields?.deadline?.value;
  if (!v) return { kind: 'unknown' };
  if (v === 'rolling') return { kind: 'rolling' };
  return { kind: 'date', date: v, days: daysUntil(v, now) };
}

// ---------------------------------------------------------------- field values

/** A field's value as display text. */
export function fieldText(key, fv) {
  if (!fv) return '';
  const def = FIELD_BY_KEY[key];
  const v = fv.value;
  if (v == null || v === '') return fv.text || '';
  if (def?.type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
  if (def?.type === 'money') return moneyText(v, fv.text);
  if (def?.type === 'deadline' && v === 'rolling') return 'Rolling / no deadline';
  if (typeof v === 'object' && v.start) return `${v.start}${v.end ? ` to ${v.end}` : ''}`;
  if (typeof v === 'object') return fv.text || '';
  return String(v);
}

export function moneyText(v, fallback = '') {
  if (!v || typeof v !== 'object') return fallback || '';
  if (v.amount === 0) return 'Free';
  if (v.amount == null) return fallback || '';
  const sym = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' }[v.currency] || '';
  const n = Number(v.amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return sym ? `${sym}${n}` : `${n} ${v.currency || ''}`.trim();
}

export function sameValue(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function normalizeForCompare(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => normalizeForCompare(x)).sort().join('|');
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] != null && v[k] !== '').sort();
    return keys.map((k) => `${k}:${normalizeForCompare(v[k])}`).join(';');
  }
  return String(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * How trustworthy a field is right now, and whether you should check it.
 * Returns { state, label, needsVerify, tone }.
 *   manual      you typed it
 *   confirmed   you confirmed the extracted value
 *   conflict    your value differs from what the site now says
 *   changed     the site's value changed since it was first extracted or confirmed
 *   missing     the site no longer shows this detail
 *   stale       not checked against the site for a while
 *   unverified  extracted automatically and not yet confirmed
 */
export function fieldStatus(fv, { staleAfterDays = 14, now = Date.now(), important = false } = {}) {
  if (!fv) return { state: 'empty', label: 'Not found', needsVerify: false, tone: 'muted' };
  if (fv.siteValue) return { state: 'conflict', label: 'Site now differs', needsVerify: true, tone: 'bad' };
  if (fv.missingOnSiteAt && fv.origin !== 'manual') return { state: 'missing', label: 'No longer on site', needsVerify: true, tone: 'warn' };
  if (fv.changedAt && (!fv.verifiedAt || fv.changedAt > fv.verifiedAt)) {
    return { state: 'changed', label: 'Changed on site', needsVerify: true, tone: 'warn' };
  }
  if (fv.origin === 'manual') return { state: 'manual', label: 'Entered by you', needsVerify: false, tone: 'ok' };
  const checked = Date.parse(fv.checkedAt || fv.extractedAt || 0) || 0;
  const stale = checked && now - checked > staleAfterDays * DAY;
  if (fv.verified) {
    if (stale) return { state: 'stale', label: 'Confirmed, not rechecked lately', needsVerify: important, tone: 'warn' };
    return { state: 'confirmed', label: 'Confirmed by you', needsVerify: false, tone: 'ok' };
  }
  if (stale) return { state: 'stale', label: 'Not rechecked lately', needsVerify: true, tone: 'warn' };
  const low = (fv.confidence ?? 0.5) < 0.6;
  const needsVerify = important || low || fv.origin === 'ai';
  const base = fv.origin === 'ai' ? 'Extracted by AI' : fv.origin === 'listing' ? 'From the listing only' : low ? 'Uncertain' : 'Extracted';
  return {
    state: 'unverified',
    label: needsVerify ? `${base} — verify` : base,
    needsVerify,
    tone: low || fv.origin === 'ai' ? 'warn' : 'info',
  };
}

export function verifyCount(opp, opts = {}) {
  let n = 0;
  for (const f of OPP_FIELDS) {
    const st = fieldStatus(opp.fields?.[f.key], { ...opts, important: !!f.important });
    if (st.needsVerify) n += 1;
  }
  return n;
}

export const ORIGIN_LABELS = {
  extracted: 'Extracted from page',
  listing: 'From the source listing',
  jsonld: 'From the page’s structured data',
  ai: 'Extracted by AI',
  manual: 'Entered by you',
  capture: 'Captured from browser',
  feed: 'From the source’s feed',
  search: 'From a web search result',
  instagram: 'From an Instagram post',
};

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function wordCount(s) {
  const m = String(s || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function charCount(s) {
  return [...String(s || '')].length;
}

export function oppName(opp) {
  return opp?.fields?.name?.value || opp?.title || hostOf(opp?.url) || 'Untitled opportunity';
}

// ---------------------------------------------------------------- residency focus filter

export const FOCUS_FILTERS = [
  { value: '', label: 'Any focus' },
  { value: 'timespace', label: 'Time & space' },
  { value: 'timespace-open', label: 'Time & space or not stated' },
  { value: 'duties', label: 'Project or duties required' },
];

const NOT_RESIDENCIES = new Set(['Grant', 'Prize / award', 'Commission']);

export function isTimeAndSpace(opp) {
  return opp?.fields?.focus?.value === 'Time and space';
}

/** Whether an opportunity passes a FOCUS_FILTERS value. */
export function matchesFocus(opp, filter) {
  if (!filter) return true;
  const v = opp?.fields?.focus?.value || '';
  if (filter === 'timespace') return v === 'Time and space';
  if (filter === 'timespace-open') return v === 'Time and space' || (!v && !NOT_RESIDENCIES.has(opp?.fields?.type?.value));
  if (filter === 'duties') return !!v && v !== 'Time and space';
  return true;
}

export function isOnline(opp) {
  const mode = opp?.fields?.mode?.value;
  return mode === 'Online';
}

// ---------------------------------------------------------------- application helpers

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };

/** The first count in a text ("two letters" → 2). */
export function requiredCount(text) {
  const m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\b/i.exec(String(text || ''));
  if (!m) return null;
  return WORD_NUM[m[1].toLowerCase()] ?? Number(m[1]);
}

/** How many work samples a call asks for: { min, max } or null. */
export function sampleLimit(text) {
  const s = String(text || '').toLowerCase();
  // Counts of images or works come first; "up to 3 links" is usually an alternative, not the main limit.
  for (const unit of ['images|works|photos|photographs|samples|pieces|artworks|jpe?gs', 'files|links|videos|tracks|recordings']) {
    const range = new RegExp(`(\\d{1,2})\\s*(?:-|–|to)\\s*(\\d{1,2})\\s*(?:${unit})`).exec(s);
    if (range) return { min: +range[1], max: +range[2] };
    const upTo = new RegExp(`(?:up to|maximum of|max\\.?|no more than|at most)\\s*(\\d{1,2})\\s*(?:${unit})`).exec(s);
    if (upTo) return { min: 1, max: +upTo[1] };
    const exact = new RegExp(`(\\d{1,2})\\s*(?:${unit})`).exec(s);
    if (exact) return { min: +exact[1], max: +exact[1] };
  }
  return null;
}

export const DERIVED_MATERIALS = new Set(['proposal', 'samples', 'letters', 'fee']);

/**
 * A material's status. For the proposal, samples, letters and fee it is worked out from the
 * application itself, so the checklist can't drift out of date.
 * @returns {{ status: 'todo'|'drafting'|'done', note: string, derived: boolean }}
 */
export function materialStatus(m, app, opp, proposal) {
  const f = opp?.fields || {};
  switch (m.type) {
    case 'proposal': {
      if (!app.proposalId || !proposal) return { status: 'todo', note: 'No proposal chosen yet', derived: true };
      const placeholders = Object.values(proposal.sections || {}).some((t) => /\[ADD:[^\]]*\]/.test(t || ''));
      const empty = !Object.values(proposal.sections || {}).some((t) => String(t || '').trim());
      if (empty || placeholders) return { status: 'drafting', note: empty ? 'Proposal is empty' : 'Still has [ADD: …] placeholders', derived: true };
      return { status: 'done', note: proposal.title, derived: true };
    }
    case 'samples': {
      const n = (app.samples || []).filter((s) => s.include !== false).length;
      const lim = sampleLimit(fieldText('workSamples', f.workSamples));
      if (!n) return { status: 'todo', note: lim ? `None selected; the call asks for ${lim.min === lim.max ? lim.min : `${lim.min}–${lim.max}`}` : 'None selected', derived: true };
      if (lim && n < lim.min) return { status: 'drafting', note: `${n} of ${lim.min} selected`, derived: true };
      if (lim && n > lim.max) return { status: 'drafting', note: `${n} selected; the limit is ${lim.max}`, derived: true };
      return { status: 'done', note: `${n} selected`, derived: true };
    }
    case 'letters': {
      const recs = app.recommendations || [];
      const asks = fieldText('recommendations', f.recommendations);
      const needed = /not required/i.test(asks) ? 0 : (requiredCount(asks) || recs.length || 1);
      const ready = recs.filter((r) => ['agreed', 'submitted'].includes(r.status)).length;
      if (!recs.length) return { status: needed ? 'todo' : 'done', note: needed ? `No recommenders yet (needs ${needed})` : 'Not required', derived: true };
      if (ready >= needed) return { status: 'done', note: `${ready} of ${needed} agreed or sent`, derived: true };
      return { status: 'drafting', note: `${ready} of ${needed} agreed or sent`, derived: true };
    }
    case 'fee':
      return app.feePaid ? { status: 'done', note: 'Paid', derived: true } : { status: 'todo', note: 'Not paid yet (mark it on Overview)', derived: true };
    default:
      return { status: m.status || 'todo', note: '', derived: false };
  }
}

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}${t}${r}`;
}
