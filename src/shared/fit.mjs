// Compares an opportunity with your artist profile and explains the result.
// Pure function: runs in the window (live as you edit your profile) and in the app process.
import { deadlineOf, fieldText, FIELD_BY_KEY } from './schema.mjs';
import { findPlaces, placeMatches, regionOf, canonicalPlaces } from './geo.mjs';

export const FIT_CRITERIA = [
  { key: 'deadline', label: 'Deadline' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'goals', label: 'Goals and themes' },
  { key: 'funding', label: 'Funding' },
  { key: 'fees', label: 'Fees' },
  { key: 'format', label: 'In person / online' },
  { key: 'region', label: 'Region' },
  { key: 'length', label: 'Length' },
  { key: 'dates', label: 'Your availability' },
  { key: 'needs', label: 'Your needs' },
  { key: 'readiness', label: 'Your materials' },
];

export const DEFAULT_WEIGHTS = {
  deadline: 3, eligibility: 3, discipline: 2, goals: 2, funding: 2, fees: 2, format: 1, region: 1, length: 1, dates: 2, needs: 1, readiness: 1,
};

export const DEFAULT_PROFILE = {
  name: '',
  website: '',
  basedIn: '',
  countries: [],
  languages: ['English'],
  birthYear: null,
  careerStage: '',
  isStudent: false,
  disciplines: [],
  mediums: [],
  themes: [],
  goals: '',
  goalTags: [],
  prefs: {
    funding: 'prefer-funded',
    maxApplicationFee: null,
    maxProgramFee: null,
    currency: 'USD',
    formats: ['In person', 'Online', 'Hybrid'],
    preferRegions: [],
    avoidRegions: [],
    minWeeks: null,
    maxWeeks: null,
    unavailable: [],
    needs: [],
  },
  weights: { ...DEFAULT_WEIGHTS },
};

const TONE_POINTS = { good: 1, warn: -0.6, bad: -1.6, unknown: 0, info: 0 };

const DISCIPLINE_SYNONYMS = {
  'Visual arts': ['visual art', 'fine art', 'contemporary art'],
  'Film / video': ['film', 'video', 'moving image', 'cinema', 'filmmak'],
  'Sound art': ['sound', 'audio', 'sonic', 'acoustic', 'field recording'],
  Music: ['music', 'musician', 'composer', 'songwrit', 'band', 'improvis', 'jazz', 'guitar'],
  Composition: ['compos', 'score', 'new music'],
  Writing: ['writ', 'literary', 'literature', 'fiction', 'nonfiction', 'author'],
  Poetry: ['poet'],
  'New media': ['new media', 'media art', 'digital', 'technology', 'interactive', 'creative coding'],
  'Digital art': ['digital', 'virtual reality', 'vr', 'ai art', 'generative'],
  Performance: ['performance', 'performing'],
  Theatre: ['theatre', 'theater', 'playwright'],
  Dance: ['dance', 'choreograph'],
  Photography: ['photograph', 'photo'],
  Printmaking: ['print'],
  Ceramics: ['ceramic', 'clay', 'pottery'],
  Textiles: ['textile', 'fiber', 'fibre', 'weav'],
  Craft: ['craft', 'woodwork', 'glass', 'metal'],
  Curating: ['curat'],
  'Social practice': ['social practice', 'socially engaged', 'community'],
  Interdisciplinary: ['interdisciplinary', 'multidisciplinary', 'transdisciplinary', 'cross-disciplinary'],
};

const OPEN_TO_ALL = /\b(all|any|every) (artistic )?(disciplines?|media|mediums|art ?forms|creative fields)\b|\b(multi|inter|trans)disciplinary\b|\bartists (of|from|working in|across) all\b|\ball creative practitioners\b/i;

function textOf(opp) {
  const f = opp.fields || {};
  return ['name', 'type', 'discipline', 'description', 'eligibility', 'fundingType', 'fundingAmount', 'fundingRestrictions', 'requirements', 'workSamples', 'duration', 'location']
    .map((k) => fieldText(k, f[k]))
    .concat(opp.pageExcerpt || opp.pageText ? [(opp.pageExcerpt || opp.pageText).slice(0, 20000)] : [])
    .join('\n');
}

function sentences(text) {
  return String(text || '').split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function mentions(text, keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (k.length < 2) return false;
  const re = new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu');
  return re.test(text);
}

export function parseWeeks(text) {
  const s = String(text || '').toLowerCase();
  const vals = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:[-–—to]+\s*(\d+(?:\.\d+)?)\s*)?(day|week|month|year)s?\b/g;
  let m;
  while ((m = re.exec(s))) {
    const unit = { day: 1 / 7, week: 1, month: 4.345, year: 52 }[m[3]];
    vals.push(+m[1] * unit);
    if (m[2]) vals.push(+m[2] * unit);
  }
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

/** Length in weeks from a {start, end} date range. */
export function weeksFromRange(v) {
  if (!v || typeof v !== 'object' || !v.start || !v.end) return null;
  const a = Date.parse(`${v.start}T00:00:00Z`);
  const b = Date.parse(`${v.end}T00:00:00Z`);
  if (!a || !b || b < a) return null;
  const w = (b - a) / (7 * 86400000) + 1 / 7;
  return { min: w, max: w };
}

function feeAmount(fv) {
  const v = fv?.value;
  if (v && typeof v === 'object' && v.amount != null) return { amount: Number(v.amount), currency: v.currency || null };
  return null;
}

/**
 * @returns {{ score:number|null, verdict:string, verdictLabel:string, reasons:Array, known:number }}
 */
export function assessFit(opp, profileIn, ctx = {}) {
  const profile = { ...DEFAULT_PROFILE, ...(profileIn || {}), prefs: { ...DEFAULT_PROFILE.prefs, ...(profileIn?.prefs || {}) } };
  const weights = { ...DEFAULT_WEIGHTS, ...(profile.weights || {}) };
  const now = ctx.now || new Date();
  const f = opp.fields || {};
  const text = textOf(opp);
  const reasons = [];
  const add = (criterion, tone, label, detail = '') => reasons.push({ criterion, tone, label, detail });

  // ---- deadline
  const dl = deadlineOf(opp, now);
  if (dl.kind === 'rolling') add('deadline', 'good', 'Rolling applications', 'You can apply any time.');
  else if (dl.kind === 'date') {
    if (dl.days < 0) add('deadline', 'bad', 'Deadline has passed', `It closed ${-dl.days} day${dl.days === -1 ? '' : 's'} ago.`);
    else if (dl.days <= 7) add('deadline', 'warn', `Only ${dl.days} day${dl.days === 1 ? '' : 's'} left`, 'Tight, but possible if your materials are ready.');
    else if (dl.days <= 21) add('deadline', 'good', `${dl.days} days to apply`, '');
    else add('deadline', 'good', `${dl.days} days to apply`, 'Plenty of time.');
  } else add('deadline', 'unknown', 'Deadline not found', 'Check the page and add it.');

  // ---- eligibility
  const elig = fieldText('eligibility', f.eligibility);
  const eligText = elig || text;
  const restrictive = sentences(eligText).filter((s) => /\b(only|must|eligible|eligibility|open to|restricted|limited to|citizens?|residents?|nationals?|based in|living in|resident in|reside in|who live)\b/i.test(s));
  const international = /\b(international|worldwide|all nationalities|any nationality|from (anywhere|around the world|all over the world)|open to artists (from )?(all|any) countr)/i.test(eligText);
  const yourPlaces = canonicalPlaces([...(profile.countries || []), profile.basedIn]);
  const placesMentioned = [];
  for (const s of restrictive) {
    if (!/\b(citizens?|residents?|nationals?|based|living|live|reside|resident|from|born|located)\b/i.test(s)) continue;
    for (const p of findPlaces(s)) if (!placesMentioned.includes(p.name)) placesMentioned.push(p.name);
  }
  // "Artists based in Berlin or Brandenburg", "living in Europe": places that aren't countries or states.
  let localPhrase = null;
  const REGION_WORDS = { europe: 'Europe', 'european union': 'Europe', eu: 'Europe', asia: 'Asia', africa: 'Africa', 'latin america': 'Latin America & Caribbean', 'south america': 'Latin America & Caribbean', caribbean: 'Latin America & Caribbean', 'north america': 'North America', oceania: 'Oceania', 'middle east': 'Middle East' };
  if (!placesMentioned.length) {
    for (const s of restrictive) {
      const m = /\b(?:based|living|resident|residing|who live|who reside|located|reside)\s+(?:in|within)\s+(?:the\s+)?([^.;:()]{3,80})/i.exec(s);
      if (!m) continue;
      const phrase = m[1].replace(/\s+(are|is|may|can|must|will|who|and are)\b.*$/i, '').trim();
      const region = Object.entries(REGION_WORDS).find(([k]) => new RegExp(`\\b${k}\\b`, 'i').test(phrase));
      if (region) { placesMentioned.push(region[1]); break; }
      if (/\b(any|all|the world|anywhere)\b/i.test(phrase)) break;
      localPhrase = phrase;
      break;
    }
  }
  if (localPhrase && !international) {
    const words = localPhrase.split(/\s+(?:or|and|,)\s+|,\s*/).map((w) => w.trim()).filter((w) => /^[A-Z]/.test(w));
    const home = `${profile.basedIn || ''} ${(profile.countries || []).join(' ')}`.toLowerCase();
    if (words.length && words.some((w) => home.includes(w.toLowerCase()))) add('eligibility', 'good', `For artists in ${localPhrase}`, 'Matches where you’re based.');
    else if (words.length) add('eligibility', profile.basedIn ? 'bad' : 'unknown', `Appears limited to artists in ${localPhrase}`, profile.basedIn ? `You’re based in ${profile.basedIn}.` : 'Add where you’re based in Profile.');
  }
  if (placesMentioned.length) {
    if (!yourPlaces.length) add('eligibility', 'unknown', `Limited to certain places (${placesMentioned.slice(0, 3).join(', ')})`, 'Add where you live and your citizenship in Profile so Atelier can check.');
    else if (placesMentioned.some((p) => yourPlaces.some((y) => placeMatches(y, p)))) add('eligibility', 'good', `Open to artists in ${placesMentioned.find((p) => yourPlaces.some((y) => placeMatches(y, p)))}`, 'Matches where you live or your citizenship.');
    else if (international) add('eligibility', 'warn', `Mentions ${placesMentioned.slice(0, 3).join(', ')}`, 'It also says it is international — read the eligibility rules closely.');
    else add('eligibility', 'bad', `Appears limited to ${placesMentioned.slice(0, 3).join(', ')}`, `You list ${yourPlaces.join(', ')}.`);
  } else if (international) add('eligibility', 'good', 'Open internationally', '');

  const age = /\b(?:under|younger than|below|up to|not older than|no older than|max(?:imum)? age(?: of)?)\s*(\d{2})\b|\b(?:aged?|between)\s*(\d{2})\s*(?:-|–|to|and)\s*(\d{2})\b|\b(\d{2})\s*(?:years? (?:old|of age) )?or (?:older|over)\b|\bover (?:the age of )?(\d{2})\b|\bborn (?:after|in or after)\s*(\d{4})\b|\b(\d{2})\+\s*(?:years|yrs)/i.exec(eligText);
  if (age) {
    const thisYear = now.getFullYear();
    let min = null; let max = null;
    if (age[1]) max = +age[1];
    if (age[2]) { min = +age[2]; max = +age[3]; }
    if (age[4]) min = +age[4];
    if (age[5]) min = +age[5] + 1;
    if (age[6]) max = thisYear - +age[6];
    if (age[7]) min = +age[7];
    const rule = age[0].trim();
    if (!profile.birthYear) add('eligibility', 'unknown', `Age rule: “${rule}”`, 'Add your birth year in Profile (kept on this Mac) to check age limits.');
    else {
      const yours = thisYear - Number(profile.birthYear);
      const ok = (min == null || yours >= min - 1) && (max == null || yours <= max);
      add('eligibility', ok ? 'good' : 'bad', ok ? 'Within the age limit' : 'Outside the age limit', `Rule: “${rule}”.`);
    }
  }
  const NEG = /\b(not|no|ineligible|excluded|excluding|cannot|can't|may not)\b/i;
  const studentSentences = sentences(eligText).filter((s) => /\bstudents?\b|\benrolled\b/i.test(s));
  const studentsExcluded = studentSentences.some((s) => NEG.test(s));
  const studentsOnly = studentSentences.some((s) => !NEG.test(s) && /\b(students only|current(ly)? enrolled|must be enrolled|open (only )?to (current )?students)\b/i.test(s));
  if (studentsExcluded && profile.isStudent) add('eligibility', 'bad', 'Not open to students', '');
  if (studentsOnly && !profile.isStudent) add('eligibility', 'bad', 'For enrolled students', '');
  if (/\b(emerging|early[- ]career)\b/i.test(eligText) && profile.careerStage === 'established') add('eligibility', 'warn', 'Aimed at emerging artists', '');
  if (/\b(mid[- ]career|established)\b/i.test(eligText) && profile.careerStage === 'emerging') add('eligibility', 'warn', 'Aimed at mid-career or established artists', '');
  if (/\b(women|female|non-binary|trans|bipoc|black|indigenous|latinx|latine|asian|disabled|deaf|queer|lgbtq\+?|veterans?|parents?|mothers?)[- ](identif\w*|artists?|only|led|-led)\b/i.test(eligText)) {
    add('eligibility', 'unknown', 'Focused on a specific community', 'Read who it is for and decide whether it applies to you.');
  }

  // ---- discipline
  const oppDisc = Array.isArray(f.discipline?.value) ? f.discipline.value : [];
  const yourDisc = [...(profile.disciplines || []), ...(profile.mediums || [])];
  if (yourDisc.length) {
    const lowerText = text.toLowerCase();
    const hits = yourDisc.filter((d) => {
      if (oppDisc.some((o) => o.toLowerCase() === d.toLowerCase())) return true;
      const syn = DISCIPLINE_SYNONYMS[d] || [d.toLowerCase()];
      return syn.some((k) => mentions(lowerText, k));
    });
    if (hits.length) add('discipline', 'good', `Includes ${hits.slice(0, 3).join(', ')}`, '');
    else if (OPEN_TO_ALL.test(text)) add('discipline', 'good', 'Open to all disciplines', '');
    else if (oppDisc.length) add('discipline', 'bad', `Focused on ${oppDisc.slice(0, 3).join(', ')}`, `Your disciplines: ${yourDisc.slice(0, 4).join(', ')}.`);
    else add('discipline', 'unknown', 'Disciplines not listed', '');
  } else add('discipline', 'unknown', 'Add your disciplines in Profile', '');

  // ---- goals / themes
  const goalWords = [...(profile.themes || []), ...(profile.goalTags || [])].filter(Boolean);
  if (goalWords.length) {
    const hits = goalWords.filter((w) => mentions(text, w));
    if (hits.length) add('goals', 'good', `Mentions ${hits.slice(0, 4).join(', ')}`, 'Connects to your themes and goals.');
    else add('goals', 'info', 'No overlap with your themes', `Looked for: ${goalWords.slice(0, 5).join(', ')}.`);
  }

  // ---- funding
  const funding = Array.isArray(f.fundingType?.value) ? f.fundingType.value : [];
  const funded = funding.some((x) => /fully funded|stipend|grant|artist fee|prize money|production budget/i.test(x)) || /\b(fully[- ](funded|sponsored)|stipend|honorarium|travel (grant|allowance|reimbursement)|per diem)\b/i.test(fieldText('fundingAmount', f.fundingAmount));
  const support = funding.some((x) => /housing|meals|travel|materials/i.test(x));
  const unfunded = funding.some((x) => /no funding|self-funded/i.test(x));
  const programFee = feeAmount(f.programFee);
  const pref = profile.prefs.funding;
  if (funded) add('funding', 'good', `Funded: ${funding.filter((x) => !/no funding|self/i.test(x)).slice(0, 3).join(', ') || 'stipend'}`, fieldText('fundingAmount', f.fundingAmount));
  else if (support) add('funding', pref === 'funded-only' ? 'warn' : 'good', `Support: ${funding.slice(0, 3).join(', ')}`, 'No stipend listed.');
  else if (unfunded || (programFee && programFee.amount > 0)) {
    const tone = pref === 'funded-only' ? 'bad' : pref === 'prefer-funded' ? 'warn' : 'info';
    add('funding', tone, programFee?.amount > 0 ? 'You pay to attend' : 'No funding', programFee?.amount > 0 ? `Program fee ${fieldText('programFee', f.programFee)}.` : '');
  } else add('funding', 'unknown', 'Funding not stated', '');

  // ---- fees
  const appFee = feeAmount(f.applicationFee);
  if (appFee) {
    const max = profile.prefs.maxApplicationFee;
    const sameCurrency = !appFee.currency || !profile.prefs.currency || appFee.currency === profile.prefs.currency;
    if (appFee.amount === 0) add('fees', 'good', 'No application fee', '');
    else if (max != null && max !== '' && sameCurrency && appFee.amount > Number(max)) add('fees', 'warn', `Application fee ${fieldText('applicationFee', f.applicationFee)}`, `Above your limit of ${max}.`);
    else add('fees', 'info', `Application fee ${fieldText('applicationFee', f.applicationFee)}`, sameCurrency ? '' : 'In a different currency from your limit.');
  } else add('fees', 'unknown', 'Application fee not stated', '');
  if (programFee && programFee.amount > 0 && profile.prefs.maxProgramFee != null && profile.prefs.maxProgramFee !== '' && programFee.amount > Number(profile.prefs.maxProgramFee)) {
    add('fees', 'bad', `Program fee ${fieldText('programFee', f.programFee)}`, `Above your limit of ${profile.prefs.maxProgramFee}.`);
  }

  // ---- format
  const mode = f.mode?.value;
  const formats = profile.prefs.formats || [];
  if (mode) {
    if (formats.length && !formats.includes(mode)) add('format', 'bad', `${mode} only`, `You prefer: ${formats.join(', ')}.`);
    else add('format', 'good', mode, '');
  }

  // ---- region
  const loc = fieldText('location', f.location);
  if (loc && mode !== 'Online') {
    const places = findPlaces(loc);
    const where = places[0]?.name;
    const region = where ? regionOf(where) : null;
    const prefer = profile.prefs.preferRegions || [];
    const avoid = profile.prefs.avoidRegions || [];
    const inList = (list) => list.some((r) => r === region || r === where || (where && placeMatches(where, r)));
    if (avoid.length && inList(avoid)) add('region', 'warn', `In ${where}`, 'A region you said you would rather avoid.');
    else if (prefer.length && inList(prefer)) add('region', 'good', `In ${where}`, 'A region you prefer.');
    else if (prefer.length && where) add('region', 'info', `In ${where}`, 'Not in your preferred regions.');
  }

  // ---- length
  const weeks = parseWeeks(fieldText('duration', f.duration)) || weeksFromRange(f.programDates?.value);
  const { minWeeks, maxWeeks } = profile.prefs;
  if (weeks && (minWeeks || maxWeeks)) {
    const tooShort = minWeeks && weeks.max < Number(minWeeks);
    const tooLong = maxWeeks && weeks.min > Number(maxWeeks);
    const len = weeks.min === weeks.max ? `${Math.round(weeks.min * 10) / 10} weeks` : `${Math.round(weeks.min)}–${Math.round(weeks.max)} weeks`;
    if (tooShort) add('length', 'warn', `Shorter than you want (${len})`, '');
    else if (tooLong) add('length', 'warn', `Longer than you can stay (${len})`, '');
    else add('length', 'good', `Length fits (${len})`, '');
  }

  // ---- availability
  const pd = f.programDates?.value;
  if (pd && typeof pd === 'object' && pd.start && (profile.prefs.unavailable || []).length) {
    const end = pd.end || pd.start;
    const clash = profile.prefs.unavailable.find((u) => u.from && u.to && !(end < u.from || pd.start > u.to));
    if (clash) add('dates', 'warn', 'Overlaps a time you are unavailable', `${clash.label || 'Unavailable'}: ${clash.from} – ${clash.to}.`);
    else add('dates', 'good', 'Program dates fit your calendar', '');
  }

  // ---- needs
  for (const need of profile.prefs.needs || []) {
    if (!need) continue;
    if (mentions(text, need)) add('needs', 'good', `Mentions ${need}`, '');
    else add('needs', 'unknown', `Doesn’t mention ${need}`, 'Ask the organizers if it matters to you.');
  }

  // ---- readiness (what you already have)
  const recs = String(fieldText('recommendations', f.recommendations));
  const recCount = /\b(\d+|one|two|three|four)\b/i.exec(recs);
  if (recCount && ctx.contactsCount != null) {
    const n = { one: 1, two: 2, three: 3, four: 4 }[recCount[1].toLowerCase()] ?? Number(recCount[1]);
    if (n > ctx.contactsCount) add('readiness', 'warn', `Needs ${n} recommendation letter${n === 1 ? '' : 's'}`, `You have ${ctx.contactsCount} recommender${ctx.contactsCount === 1 ? '' : 's'} saved.`);
    else if (n > 0) add('readiness', 'good', `Needs ${n} letter${n === 1 ? '' : 's'}; you have recommenders saved`, '');
  }
  const samples = fieldText('workSamples', f.workSamples).toLowerCase();
  if (samples && ctx.portfolioKinds) {
    for (const [kind, re] of [['video', /video|film|moving image/], ['audio', /audio|sound|recording|music/], ['image', /image|photo|jpeg|jpg/]]) {
      if (re.test(samples) && !ctx.portfolioKinds.has(kind)) add('readiness', 'warn', `Asks for ${kind} samples`, `Your portfolio has no ${kind} files yet.`);
    }
  }

  // ---- score
  let sum = 0;
  let max = 0;
  let known = 0;
  for (const r of reasons) {
    const w = Number(weights[r.criterion] ?? 1);
    if (r.tone === 'unknown' || r.tone === 'info') continue;
    known += 1;
    sum += w * TONE_POINTS[r.tone];
    max += w;
  }
  const dealbreaker = reasons.some((r) => r.tone === 'bad' && ['deadline', 'eligibility', 'format'].includes(r.criterion));
  let score = max ? Math.round(Math.max(0, Math.min(100, 50 + (50 * sum) / max))) : null;
  if (dealbreaker && score != null) score = Math.min(score, 25);
  let verdict = 'unknown';
  if (known >= 2 || dealbreaker) {
    if (dealbreaker) verdict = 'unlikely';
    else if (score >= 72) verdict = 'strong';
    else if (score >= 52) verdict = 'possible';
    else verdict = 'weak';
  }
  const order = { bad: 0, warn: 1, good: 2, unknown: 3, info: 4 };
  reasons.sort((a, b) => order[a.tone] - order[b.tone]);
  return { score, verdict, verdictLabel: VERDICT_LABELS[verdict], reasons, known };
}

export const VERDICT_LABELS = {
  strong: 'Strong fit',
  possible: 'Possible fit',
  weak: 'Weak fit',
  unlikely: 'Unlikely',
  unknown: 'Not enough info',
};

// Re-exported for the window.
export { FIELD_BY_KEY };
