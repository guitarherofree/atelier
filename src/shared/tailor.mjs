// Rule-based suggestions for tailoring a proposal to one opportunity. Works with no AI connected;
// the AI option (in the app process) adds rewritten drafts on top of these.
import { fieldText, oppName, wordCount, PROPOSAL_SECTIONS } from './schema.mjs';
import { findPlaces } from './geo.mjs';
import { parseWeeks as parseWeeksSafe, weeksFromRange } from './fit.mjs';

const STOP = new Set(('a an the and or but of to in on for with by from at as is are be was were will would can could should may might ' +
  'this that these those it its their our your you we they he she them his her who whom which what when where why how all any ' +
  'each other some such no not only own same so than too very just also into over under again further then once here there ' +
  'about above below up down out off more most both few if while during before after between through per via within without ' +
  'artist artists art arts residency residencies program programme programs application applications apply applicants applicant ' +
  'open call calls deadline year years month months week weeks day days time new work works project projects including include ' +
  'please must have has had do does did one two three first please selected selection submit submission include includes provide ' +
  'provided based us www http https com org html email contact information info page site website click here read more ' +
  'statement proposal proposals send short words word images image letters letter reference references recent links link video ' +
  'audio required require requires resume max maximum minimum stipend fee fees receive receives residents resident deadline ' +
  'application questions answer apply online form upload pdf portfolio samples sample documents document cover additional ' +
  'small large aged older younger international disciplines discipline sustained practice practices currently enrolled degree eligible ' +
  'shared private host hosts hosted offer offers provide provides accommodation travel support').split(/\s+/));

/** The call's most characteristic words (simple frequency, stop words removed). */
export function keyTerms(text, limit = 12, minCount = 2) {
  const counts = new Map();
  for (const raw of String(text || '').toLowerCase().match(/[\p{L}][\p{L}'-]{3,}/gu) || []) {
    const w = raw.replace(/'s$/, '');
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= minCount).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}

const FACILITIES = [
  'recording studio', 'sound studio', 'studio', 'darkroom', 'kiln', 'print shop', 'printmaking studio', 'woodshop', 'wood shop',
  'metal shop', 'piano', 'rehearsal space', 'dance studio', 'black box', 'gallery', 'library', 'archive', 'lab', 'laboratory',
  'garden', 'farm', 'forest', 'projector', '3d printer', 'laser cutter', 'editing suite', 'cabin',
];
const ENGAGEMENT = ['open studio', 'artist talk', 'workshop', 'public program', 'community', 'exhibition', 'public presentation', 'final presentation', 'performance', 'concert', 'school', 'outreach'];

function has(text, word) {
  return new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu').test(text);
}

/**
 * @returns {Array<{ id, section, kind, text, insert? }>}
 */
export function tailoringSuggestions(proposal, opp) {
  const sections = proposal?.sections || {};
  const all = PROPOSAL_SECTIONS.map((s) => sections[s.key] || '').join('\n');
  const fieldsText = ['description', 'eligibility', 'fundingType', 'requirements', 'workSamples', 'duration', 'programDates', 'discipline']
    .map((k) => fieldText(k, opp?.fields?.[k])).join('\n');
  const page = (opp?.pageExcerpt || opp?.pageText || '').slice(0, 15000);
  const callText = `${fieldsText}\n${page}`;
  const name = oppName(opp);
  const org = fieldText('organization', opp?.fields?.organization);
  const out = [];
  const push = (section, kind, text, insert) => out.push({ id: `${kind}-${out.length}`, section, kind, text, insert });

  const nameShort = name.replace(/\s*[|–—-].*$/, '').trim();
  const core = nameShort.replace(/\b(open call|call for (artists|applications|proposals)|artists?[- ]in[- ]residence|residency|residencies|program(me)?|fellowship|grant|award|20\d\d|spring|summer|fall|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const named = (core.length >= 3 && has(all, core)) || (org && has(all, org)) || has(all, nameShort.slice(0, 40));
  if (nameShort && !named) {
    push('residencyUse', 'specific', `Name ${org || nameShort} and say why this opportunity, specifically, suits the project.`,
      `At ${org || nameShort}, I would …`);
  }

  const loc = fieldText('location', opp?.fields?.location);
  const place = findPlaces(loc)[0]?.name || loc.split(',')[0]?.trim();
  if (place && opp?.fields?.mode?.value !== 'Online' && !has(all, place) && place.length > 2) {
    push('residencyUse', 'place', `Connect the work to the place: ${loc}. What will being there make possible?`);
  }

  for (const fac of FACILITIES) {
    if (has(callText, fac) && !has(all, fac)) {
      push('residencyUse', 'facility', `The call mentions a ${fac}. Say how you would use it, if you would.`);
      if (out.filter((s) => s.kind === 'facility').length >= 2) break;
    }
  }

  const engagements = ENGAGEMENT.filter((e) => has(callText, e) && !has(all, e));
  if (engagements.length) push('outcomes', 'engagement', `The call expects ${engagements.slice(0, 3).join(', ')}. Describe what you would share and with whom.`);

  const weeks = parseWeeksSafe(fieldText('duration', opp?.fields?.duration)) || weeksFromRange(opp?.fields?.programDates?.value);
  if (weeks) {
    const len = weeks.min === weeks.max ? `${Math.round(weeks.min)} weeks` : `${Math.round(weeks.min)}–${Math.round(weeks.max)} weeks`;
    if (!sections.timeline?.trim()) push('timeline', 'timeline', `Add a week-by-week plan that fits the stay (${len}).`);
    else push('timeline', 'timeline', `Check your timeline fits a stay of ${len}.`);
  }

  const reqs = (opp?.fields?.requirements?.value || []).join(' ').toLowerCase() + ' ' + callText.toLowerCase();
  if (/budget/.test(reqs) && !sections.budget?.trim()) push('budget', 'missing', 'The call asks for a budget, and this proposal has none yet.');

  const terms = keyTerms(page || fieldsText, 12, page ? 3 : 2).filter((t) => !has(all, t)).slice(0, 6);
  if (terms.length) push('description', 'themes', `Words the call returns to that your proposal doesn’t use: ${terms.join(', ')}. Address the ones that are genuinely relevant.`);

  for (const s of PROPOSAL_SECTIONS) {
    if (['summary', 'description', 'residencyUse'].includes(s.key) && !sections[s.key]?.trim()) push(s.key, 'missing', `${s.label} is empty.`);
  }
  if (wordCount(sections.summary) > 60) push('summary', 'length', 'The summary is long; most forms want one or two sentences.');
  return out;
}
