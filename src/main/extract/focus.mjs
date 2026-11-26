// Works out a residency's focus from the way its page describes it:
//   Time and space     studio time with no project, output or public programme required
//   Project-based      you carry out a proposed project, or must produce, exhibit or donate work
//   Public engagement  teaching, workshops, talks or community programmes are part of the deal
//   Work exchange      you work a set number of hours in return for the residency
// Pages rarely say this in one place, so it adds up signals from the wording and reports how sure
// it is. Anything below 60% shows as "Uncertain — verify".

import { RESIDENCY_FOCUS } from '../../shared/schema.mjs';

export { RESIDENCY_FOCUS };

const CATEGORY_VALUE = { ts: 'Time and space', project: 'Project-based', engagement: 'Public engagement', work: 'Work exchange' };

// "required to", "must", "asked to" … (an obligation).
const OBL = String.raw`\b(?:(?:are|is|will be|be|being)\s+)?(?:(?:required|expected|obliged|obligated|asked)\s+to|must|will need to|needs? to|agrees? to|commits? to|ha(?:ve|s) to)\s+`;
// Up to three small words before the thing ("give one short public talk").
const MODS = String.raw`(?:(?:a|an|one|two|three|\d+|at least one|weekly|monthly|public|free|community|final|short|informal|brief|their|your|the|own|new)\s+){0,3}`;

// Sentences that make the duty optional or rule it out don't count as duties.
const OPTIONAL = /\b(?:optional(?:ly)?|encouraged|welcome to|invited to|may|might|can choose|if (?:they|you) (?:wish|choose|like|want)|not (?:required|expected|obliged|obligated|mandatory|obligatory|necessary|asked)|no (?:obligations?|requirements?|expectations?|pressure|work[- ]exchange|duties|chores)|nor (?:required|expected)|voluntary|opportunit(?:y|ies) to|not (?:a |an )?project[- ]based)\b/i;

/** @type {{ id: string, cat: 'ts'|'project'|'engagement'|'work', w: number, re: RegExp, whole?: boolean, line?: boolean }[]} */
const SIGNALS = [
  // ---- time and space, strong
  { id: 'ts-name', cat: 'ts', w: 3, re: /\btime\s*(?:and|&|\+)\s*space\s+(?:residenc|program|fellowship|grant|award|retreat|studio)/i },
  { id: 'ts-selfdirected-res', cat: 'ts', w: 3, re: /\bself[- ]directed\s+(?:residenc|program|stays?|time|work|period)/i },
  { id: 'ts-no-outcome', cat: 'ts', w: 3, re: /\bno\s+(?:prescribed|required|set|expected|mandatory|fixed|specific|formal)\s+(?:outcomes?|outputs?|deliverables?|results?|products?|projects?|program(?:me)?s?|requirements?|obligations?)\b/i },
  { id: 'ts-without', cat: 'ts', w: 3, re: /\bwithout\s+(?:any\s+)?(?:(?:prescribed|required|set|expected|mandatory|fixed|formal)\s+)?(?:outcomes?|outputs?|deliverables?|obligations?|expectations?|requirements? to)\b/i },
  { id: 'ts-no-expectation', cat: 'ts', w: 3, re: /\bno\s+(?:expectations?|obligations?|requirements?|pressure)\s+(?:to|of|for|that)\b/i },
  { id: 'ts-not-required', cat: 'ts', w: 3, re: /\b(?:not|never|nor)\s+(?:required|expected|obliged|obligated|asked)\s+to\s+(?:produce|create|make|complete|finish|show|exhibit|present|deliver|share|realis|realiz|have)/i },
  { id: 'ts-no-strings', cat: 'ts', w: 3, re: /\bno strings attached\b/i },
  { id: 'ts-free-of', cat: 'ts', w: 3, re: /\bfree\s+(?:from|of)\s+(?:any\s+)?(?:obligations|expectations|requirements|deliverables)\b/i },
  { id: 'ts-process', cat: 'ts', w: 3, re: /\bprocess\s+(?:over|rather than|not)\s+(?:product|outcomes?|results?)\b|\bnot\s+(?:outcome|product|result)[- ](?:driven|oriented|focused)\b/i },
  { id: 'ts-there-are-none', cat: 'ts', w: 3, re: /\b(?:there (?:is|are)|with|has|have)\s+no\s+(?:additional\s+|formal\s+|specific\s+)?(?:requirements|obligations|expectations|deliverables)\b/i },
  { id: 'ts-not-project', cat: 'ts', w: 3, re: /\bnot\s+(?:a\s+|an\s+)?project[- ]based\b|\bno\s+(?:specific\s+)?project\s+(?:is\s+)?(?:required|necessary|needed)\b/i },
  { id: 'ts-aac-none', cat: 'ts', w: 3, whole: true, re: /\b(?:additional\s+)?expectations(?:\s*\/\s*opportunities)?\s*[:\n]\s*(?:n\/?a|none)\b/i },
  // ---- time and space, medium and weak
  { id: 'ts-phrase', cat: 'ts', w: 2, re: /\btime\s*(?:,|and|&)\s*space\b|\bspace\s*(?:and|&)\s*time\b/i },
  { id: 'ts-self', cat: 'ts', w: 2, re: /\bself[- ](?:directed|guided|paced|determined)\b/i },
  { id: 'ts-unstructured', cat: 'ts', w: 2, re: /\bunstructured time\b/i },
  { id: 'ts-gift', cat: 'ts', w: 2, re: /\bgift of time\b/i },
  { id: 'ts-own-direction', cat: 'ts', w: 2, re: /\b(?:residents?|artists?|you)\s+(?:determines?|sets?|chooses?|decides?)\s+(?:the direction|their own|your own|how (?:they|you))/i },
  { id: 'ts-uninterrupted', cat: 'ts', w: 1, re: /\buninterrupted\b/i },
  { id: 'ts-solitude', cat: 'ts', w: 1, re: /\bsolitude\b/i },
  { id: 'ts-retreat', cat: 'ts', w: 1, re: /\bretreats?\b/i },
  { id: 'ts-space-to', cat: 'ts', w: 1, re: /\bspace to (?:think|reflect|experiment|rest|explore|dream|focus)\b/i },

  // ---- project or output
  { id: 'p-based', cat: 'project', w: 3, re: /\bproject[- ]based\b/i },
  { id: 'p-realize', cat: 'project', w: 3, re: /\b(?:realis|realiz|carry out|carrying out|execut|implement|complet|deliver|develop)\w*\s+(?:the|their|your|a|an)\s+(?:proposed|submitted|specific|planned|selected|commissioned)\s+(?:project|work|piece|commission)\b/i },
  { id: 'p-proposed', cat: 'project', w: 1.5, re: /\b(?:the|their|your)\s+proposed\s+project\b/i },
  { id: 'p-produce', cat: 'project', w: 3, re: new RegExp(`${OBL}(?:produce|create|make|complete|finish|deliver|realis\\w*|realiz\\w*|develop)\\s+(?:[\\w-]+\\s+){0,3}(?:works?|pieces?|projects?|artworks?|body of work|outputs?|outcomes?|results?|exhibitions?|performances?|publications?|films?|albums?|books?|series|commissions?|murals?|installations?)\\b`, 'i') },
  { id: 'p-exhibit', cat: 'project', w: 3, re: new RegExp(`${OBL}(?:exhibit|show|present|perform|screen|publish|share)\\s+(?:(?:their|your|the|a|an|new|final|completed|finished|resulting)\\s+){0,3}(?:works?|projects?|results?|outcomes?|findings|pieces?|research)\\b`, 'i') },
  { id: 'p-final-show', cat: 'project', w: 2, re: /\b(?:final|closing|culminating|concluding|end[- ]of[- ](?:the[- ])?residency)\s+(?:group\s+|public\s+)?(?:exhibition|show|performance|concert|screening)\b/i },
  { id: 'p-results-shown', cat: 'project', w: 2, re: /\bresults?\s+(?:will be|are)\s+(?:exhibited|presented|shown|published|performed)\b/i },
  { id: 'p-donate', cat: 'project', w: 2.5, re: new RegExp(`${OBL}(?:donate|leave|give|gift|contribute)\\s+(?:a|an|one|1|at least one)\\s+(?:[\\w-]+\\s+){0,2}(?:works?|pieces?|artworks?|prints?|editions?|paintings?|photographs?)\\b`, 'i') },
  { id: 'p-line-donate', cat: 'project', w: 2, line: true, re: /^donate (?:a |an )?(?:work|piece|artwork)(?: of art)?$/i },
  { id: 'p-line-exhibit', cat: 'project', w: 1, line: true, re: /^(?:participate in (?:a |an )?(?:group )?exhibition|exhibit (?:work|at the end))$/i },

  // ---- public engagement
  { id: 'e-teach-workshop', cat: 'engagement', w: 3, re: new RegExp(`${OBL}(?:give|lead|teach|hold|host|run|conduct|facilitate|offer|deliver|organi[sz]e)\\s+${MODS}(?:workshops?|class(?:es)?|courses?|master ?class(?:es)?|seminars?|lessons?|programs?|programmes?|outreach)\\b`, 'i') },
  { id: 'e-teach', cat: 'engagement', w: 3, re: new RegExp(`${OBL}teach\\b`, 'i') },
  { id: 'e-talk', cat: 'engagement', w: 2, re: new RegExp(`${OBL}(?:give|hold|host|offer|deliver|present|do|participate in|take part in)\\s+${MODS}(?:artist(?:'s|s|’s)?\\s+)?(?:talks?|lectures?|presentations?|open studios?|readings?|studio visits?|tours?|q&a)\\b`, 'i') },
  { id: 'e-participate', cat: 'engagement', w: 3, re: new RegExp(`${OBL}(?:participate|take part|engage)\\s+in\\s+(?:(?:the|our|a|an|local)\\s+)?(?:public|community|outreach|education(?:al)?|school|youth)\\b`, 'i') },
  { id: 'e-component', cat: 'engagement', w: 3, re: /\b(?:community (?:engagement|outreach|involvement)|teaching|outreach|engagement)\s+(?:is\s+|are\s+)?(?:required|expected|mandatory|component|requirement|commitment|obligation)s?\b/i },
  { id: 'e-mandatory', cat: 'engagement', w: 3, re: /\bmandatory\s+(?:[\w-]+\s+){0,2}(?:open studios?|talks?|presentations?|workshops?|class(?:es)?|events?|exhibitions?|programs?|programmes?)\b/i },
  { id: 'e-exchange', cat: 'engagement', w: 3, re: /\bin exchange (?:for|,)[^.]{0,80}\b(?:workshops?|teaching|class(?:es)?|talks?|lectures?)\b/i },
  { id: 'e-final-presentation', cat: 'engagement', w: 1, re: /\b(?:final|closing|culminating|concluding|end[- ]of[- ](?:the[- ])?residency)\s+(?:public\s+)?(?:presentation|open studio|event)\b/i },
  { id: 'e-line-public', cat: 'engagement', w: 2, line: true, re: /^participate in public program(?:ming|s|mes?)$/i },
  { id: 'e-line-teach', cat: 'engagement', w: 2, line: true, re: /^teach (?:in (?:the )?studio|(?:a )?(?:class|workshop)s?)$/i },
  { id: 'e-line-workshop', cat: 'engagement', w: 1, line: true, re: /^lead (?:a )?workshops?(?: for [\w ]+)?$/i },
  { id: 'e-line-skillshare', cat: 'engagement', w: 0.5, line: true, re: /^lead a skill ?share$/i },
  { id: 'e-line-open-studio', cat: 'engagement', w: 0.5, line: true, re: /^participate in (?:an )?open studios?(?: [\w ]+)?$/i },
  { id: 'e-line-talk', cat: 'engagement', w: 0.5, line: true, re: /^give (?:an )?artist talk(?: or presentation)?$/i },

  // ---- work exchange
  { id: 'w-named', cat: 'work', w: 3, re: /\bwork[- ](?:exchange|trade|study)\b/i },
  { id: 'w-hours', cat: 'work', w: 3, re: /\bin exchange\b[^.]{0,80}\b\d+\s*(?:hours|hrs)\b/i },
  { id: 'w-duties', cat: 'work', w: 3, re: /\b\d+\s*(?:hours|hrs)\s*(?:per|a|each|of)\s*(?:week|day)\b[^.]{0,80}\b(?:help|assist|chores|maintain|maintenance|farm(?:ing)?|garden(?:ing)?|kitchen|front desk|cleaning|tasks|duties|volunteer)/i },
  { id: 'w-duties-before', cat: 'work', w: 3, re: /\b(?:help|assist|volunteer|chores|duties|tasks)\b[^.]{0,60}\b\d+\s*(?:hours|hrs)\s*(?:per|a|each)\s*(?:week|day)\b/i },
];

function sentencesOf(text) {
  return [...new Set(String(text || '').split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])|\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 3))];
}

/** The matched words, finished to the end of the last word ("Residenc" → "Residency"). */
function matchText(source, m) {
  const end = m.index + m[0].length;
  const tail = /^[\p{L}\p{N}’'-]*/u.exec(source.slice(end))[0];
  return trim(m[0] + tail, 80);
}

function trim(s, n = 300) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * @param {string} text  the page text (newlines kept)
 * @param {{ type?: string }} opts
 * @returns {null | { value: string, confidence: number, evidence: string, text: string, signals: { id: string, cat: string, w: number, match: string, sentence: string }[] }}
 */
export function detectFocus(text, { type } = {}) {
  const page = String(text || '').slice(0, 60000);
  if (!page.trim()) return null;
  // Grants, prizes and commissions only get a focus when the page is about a residency.
  if (['Grant', 'Prize / award', 'Commission'].includes(type) && !/\bresidenc|\bin[- ]residence\b/i.test(page)) return null;
  const sentences = sentencesOf(page);
  const found = [];
  for (const sig of SIGNALS) {
    if (sig.whole) {
      const m = sig.re.exec(page);
      if (m) found.push({ id: sig.id, cat: sig.cat, w: sig.w, match: matchText(page, m), sentence: trim(m[0]) });
      continue;
    }
    for (const s of sentences) {
      if (sig.line && (s.length > 70 || !sig.re.test(s.replace(/[.;:,]+$/, '')))) continue;
      const m = sig.line ? Object.assign([s], { index: 0 }) : sig.re.exec(s);
      if (!m) continue;
      if (sig.cat !== 'ts' && OPTIONAL.test(s)) continue;
      found.push({ id: sig.id, cat: sig.cat, w: sig.w, match: matchText(s, m), sentence: trim(s) });
      break;
    }
  }
  if (!found.length) return null;
  const score = { ts: 0, project: 0, engagement: 0, work: 0 };
  for (const f of found) score[f.cat] += f.w;
  const duties = ['project', 'engagement', 'work'].sort((a, b) => score[b] - score[a]);
  const dutyCat = duties[0];
  const duty = score[dutyCat];
  const ts = score.ts;

  let cat = null;
  let confidence = 0;
  if (ts >= 3 && duty < 3) { cat = 'ts'; confidence = duty >= 1 ? 0.6 : 0.72; }
  else if (ts >= 2 && duty < 1.5) { cat = 'ts'; confidence = 0.55; }
  else if (duty >= 3) { cat = dutyCat; confidence = ts >= 2 ? 0.5 : 0.65; }
  else if (duty >= 2 && ts < 1) { cat = dutyCat; confidence = 0.5; }
  if (!cat) return null;

  const mine = found.filter((f) => f.cat === cat).sort((a, b) => b.w - a.w);
  const others = found.filter((f) => f.cat !== cat).sort((a, b) => b.w - a.w);
  const quote = (arr) => {
    const picked = [];
    for (const f of arr) {
      const t = f.match.toLowerCase();
      if (picked.some((p) => p.toLowerCase().includes(t) || t.includes(p.toLowerCase()))) continue;
      picked.push(f.match);
      if (picked.length === 3) break;
    }
    return picked.map((t) => `“${t}”`).join(', ');
  };
  let summary = `The page says ${quote(mine)}.`;
  if (cat === 'ts' && !others.length) summary += ' No required project, output or public programme found.';
  if (others.length) summary += ` It also mentions ${quote(others)}.`;
  return { value: CATEGORY_VALUE[cat], confidence, evidence: mine[0].sentence, text: summary, signals: found };
}
