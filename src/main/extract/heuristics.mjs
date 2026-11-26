// Reads an opportunity page and pulls out the details Atelier tracks, recording for each one
// how it was found, how sure we are, and the text it came from.
import { parseHtml, getMeta, getJsonLd, stripChrome, mainNode, toLines, getLinks, clean } from './html.mjs';
import { parseDate, parseRange, ROLLING } from './dates.mjs';
import { parseMoney, allMoney, FREE } from './money.mjs';
import { findPlaces } from '../../shared/geo.mjs';
import { DISCIPLINES, hostOf } from '../../shared/schema.mjs';
import { detectFocus } from './focus.mjs';

// ---------------------------------------------------------------- labels

const LABELS = [
  ['applicationFee', /^(application|entry|submission|apply|processing|jury(ing)?|reading) fees?\b|^fees?( to apply)?$|^entry$/i],
  ['programFee', /^(residency|program(me)?|participation|studio|tuition) fees?\b|^costs?( to (the )?artists?)?$|^cost$|^price$|^fees? and costs?$/i],
  ['feesAndSupport', /^fees? (and|&) support$|^costs? (and|&) (support|funding)$/i],
  ['deadline', /^(application |submission |entry )?deadlines?\b|^closing date|^apply by|^due( date)?$|^applications? (close|due)|^call closes|^deadline to apply|^final deadline|^fecha l[ií]mite|^date limite|^bewerbungsschluss/i],
  ['openingDate', /^(applications? open(s|ing)?|opening date|call opens|application opens?|open(s|ing)? on|start of (the )?call|launch date|applications? open from)\b/i],
  ['applicationPeriod', /^(application period|call period|open call period|submission period|dates? to apply|call dates|call is open|applications? accepted)\b/i],
  ['location', /^(location|where|city|country|address|venue|place|region|located in|residency location)$/i],
  ['discipline', /^(disciplines?|artistic (fields?|disciplines?)|media|mediums?|fields?|categor(y|ies)|art ?forms?|open to disciplines|eligible disciplines|genres?)\b/i],
  ['eligibility', /^(eligibility|eligible applicants|who can apply|who should apply|who is eligible|open to|applicant requirements|requirements for applicants|participants?)\b/i],
  ['funding', /^(funding|support|what (we|the residency) (offer|provide)s?|what('s| is) (included|provided|offered)|benefits|rewards?|awards?|stipends?|grant( amount)?|compensation|honorarium|prizes?|artist (fee|stipend)|travel (stipend|support)|financial support|the residency (offers|includes|provides)|we (offer|provide)|facilities and support)\b/i],
  ['workSamples', /^(work samples?|portfolio|samples? of (your )?work|images?|documentation|media samples?)\b/i],
  ['recommendations', /^(references?|referees?|recommendations?|letters? of (reference|recommendation|support))\b/i],
  ['requirements', /^(required documents|requirements|application (materials|requirements|package|documents)|what to (submit|send|include)|how to apply|application process|to apply|materials|submission (guidelines|requirements))\b/i],
  ['programDates', /^(residency dates|program(me)? dates|dates( of (the )?residency)?|residency period|period|when|session dates|residency starts|start date)$/i],
  ['programEnd', /^(residency ends|end date)$/i],
  ['duration', /^(duration|residency length|length( of (stay|residency))?|length of stay|term)$/i],
  ['type', /^(type|opportunity type|call type)$/i],
  ['organization', /^(organi[sz](ation|er)s?|host(ed by)?|presented by|institution|organi[sz]ing body|associated (residency )?program(me)?|residency program(me)?|offered by)$/i],
  ['contact', /^(contact|contact (info|information|details)|email|questions\??)$/i],
  ['language', /^languages?( of (the )?application)?$/i],
  ['website', /^(website|web|link to more information|more (info|information)|official (website|page)|url)$/i],
  ['applyUrl', /^(apply( here| now)?|application (link|form)|how to apply online|submit here)$/i],
  ['participants', /^(number of (participants|residents|artists)|places|spots)$/i],
];

function labelField(label) {
  const l = clean(label).replace(/[:：*]+$/, '').trim();
  if (!l || l.length > 60) return null;
  for (const [key, re] of LABELS) if (re.test(l)) return key;
  return null;
}

const STOP_HEADING = /^(similar|related|more|other|recent|latest|upcoming|featured|popular) (open calls?|calls|opportunities|posts|news|residencies|articles)|you (may|might) also like|^share( this)?|^comments?$|^leave a reply|^subscribe|^newsletter|^about us$|^follow us/i;

export function cutAtRelated(lines) {
  const i = lines.findIndex((l, idx) => idx > 2 && (l.kind === 'h' || l.text.length < 40) && STOP_HEADING.test(l.text));
  return i > 0 ? lines.slice(0, i) : lines;
}

/** Label → value pairs from "Label: value" lines, definition lists, two-cell rows, label lines and headings. */
export function labelPairs(lines) {
  const pairs = [];
  const isLabelish = (t) => t.length <= 48 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 7;
  for (let i = 0; i < lines.length; i += 1) {
    const { text, kind } = lines[i];
    // "Label: value" (also inside a longer line: "Applications open Oct 1. Deadline: Nov 30.")
    let found = false;
    for (const part of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const colon = /^([^:：\d.!?]{2,60}?)\s*[:：]\s*(.{1,800})$/.exec(part);
      if (colon && !/https?$/i.test(colon[1]) && colon[1].split(/\s+/).length <= 7) {
        const key = labelField(colon[1]);
        if (key) { pairs.push({ key, label: colon[1], value: colon[2], index: i, how: 'colon' }); found = true; }
      }
    }
    if (found) continue;
    // "Label | value" table rows
    if (kind === 'cell' && text.includes('|')) {
      const cells = text.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const key = labelField(cells[0]);
        if (key) { pairs.push({ key, label: cells[0], value: cells.slice(1).join(' · '), index: i, how: 'row' }); continue; }
      }
    }
    // Label on its own line (dt, heading, short bold line), value on the following lines
    if (isLabelish(text)) {
      const key = labelField(text);
      if (!key) continue;
      const vals = [];
      let j = i + 1;
      const isHeading = kind === 'h';
      const maxChars = isHeading ? 1800 : 900;
      let chars = 0;
      while (j < lines.length) {
        const n = lines[j];
        if (n.kind === 'h' && (isHeading || isLabelish(n.text))) break;
        if (!isHeading && labelField(n.text) && isLabelish(n.text)) break;
        if (isHeading && labelField(n.text) && isLabelish(n.text) && n.kind !== 'li') break;
        if (n.kind === 'dt') break;
        vals.push(n.text);
        chars += n.text.length;
        j += 1;
        if (chars > maxChars) break;
        if (!isHeading && kind !== 'dt' && vals.length >= 4) break;
        if (kind === 'dt' && lines[j]?.kind !== 'dd') break;
      }
      if (vals.length) pairs.push({ key, label: text, value: vals.join('\n'), index: i, how: isHeading ? 'heading' : kind === 'dt' ? 'dl' : 'line' });
    }
  }
  return pairs;
}

// ---------------------------------------------------------------- vocabularies

const DISCIPLINE_WORDS = [
  ['Visual arts', /\bvisual arts?\b|\bfine arts?\b/i], ['Painting', /\bpainting|painters?\b/i], ['Drawing', /\bdrawing\b/i],
  ['Sculpture', /\bsculpt/i], ['Installation', /\binstallation/i], ['Photography', /\bphotograph/i], ['Film / video', /\b(film|video|moving image|cinema)\b/i],
  ['Sound art', /\bsound( art)?\b|\baudio\b|\bsonic\b/i], ['Music', /\bmusic|musicians?|composers?|songwrit/i], ['Composition', /\bcompos(er|ition)/i],
  ['Performance', /\bperformance art|\bperformance\b/i], ['Dance', /\bdance|choreograph/i], ['Theatre', /\btheat(re|er)\b|playwright/i],
  ['Writing', /\bwrit(ers?|ing)\b|\bliterary|\bliterature|\bfiction\b/i], ['Poetry', /\bpoet(s|ry)?\b/i], ['New media', /\bnew media|media arts?\b/i],
  ['Digital art', /\bdigital (art|media)|\bvirtual reality|\bVR\b|\bgenerative\b/i], ['Ceramics', /\bceramic|\bclay\b/i], ['Textiles', /\btextile|\bfib(er|re) arts?/i],
  ['Printmaking', /\bprintmak|\bprint ?shop|\betching|\blithograph/i], ['Craft', /\bcrafts?\b|\bwoodwork|\bglass ?blow/i], ['Design', /\bdesign(ers?)?\b/i],
  ['Architecture', /\barchitect/i], ['Curating', /\bcurat(or|ing|orial)/i], ['Research', /\bresearch(ers?)?\b/i], ['Social practice', /\bsocial(ly engaged)? practice|socially engaged/i],
  ['Interdisciplinary', /\b(inter|multi|trans)[- ]?disciplinary\b/i],
];
const ALL_DISCIPLINES = /\b(all|any) (artistic )?(disciplines?|media|mediums|art ?forms)\b|\bartists (of|from|working in|across) all disciplines\b/i;

const FUNDING_WORDS = [
  ['Fully funded', /\bfully[- ](funded|sponsored|paid)\b|\bcovers? all (costs|expenses)\b|\bfree of charge for (selected )?artists\b/i],
  ['Stipend', /\bstipends?\b|\bhonorari(um|a)\b|\bliving (allowance|costs)\b|\bper diem\b|\bdaily allowance\b|\bartist (fee|stipend)\b/i],
  ['Travel', /\btravel (costs?|expenses|allowance|stipend|grant|support|reimbursement|covered)|\b(flights?|airfare|travel) (is |are )?(covered|paid|reimbursed|included)/i],
  ['Housing', /\b(accommodation|housing|lodging|living quarters|room and board|bedroom|apartment|cabin)\b/i],
  ['Meals', /\b(meals?|board|food) (is |are )?(provided|included|covered)|\bchef[- ]prepared\b|\bfull board\b|\bdinners? (is |are )?provided/i],
  ['Materials', /\b(material|materials|production) (budget|stipend|allowance|grant|costs?)\b/i],
  ['Production budget', /\bproduction (budget|grant|fund(ing)?|support)\b/i],
  ['Grant', /\bgrants? of\b|\bgrant amount\b|\b(unrestricted|project) grants?\b|\baward of\b/i],
  ['Prize money', /\bprize money\b|\bcash prizes?\b|\bprize of\b/i],
  ['No funding', /\bno funding\b|\b(not|un)funded\b|\bdoes not (offer|provide) (funding|financial support|a stipend)\b|\bno (stipend|financial support)\b/i],
  ['Self-funded (fee to attend)', /\b(residency|program(me)?|participation) fee\b|\bself[- ]funded\b|\bartists? (are responsible for|cover|pay) (all|their own|the)? ?(costs|expenses|fees)/i],
];

const REQUIREMENT_WORDS = [
  ['CV / résumé', /\b(cv|c\.v\.|curriculum vitae|r[ée]sum[ée]s?)\b/i],
  ['Artist statement', /\bartist(['’]s)? statement\b|\bstatement of (purpose|intent)\b/i],
  ['Project proposal', /\b(project )?proposals?\b|\bproject description\b|\bproject outline\b/i],
  ['Bio', /\b(short )?bio(graphy)?\b/i],
  ['Budget', /\bbudget\b/i],
  ['Letter of intent', /\bletter of (intent|interest|motivation)|\bmotivation(al)? letter\b/i],
  ['Cover letter', /\bcover letter\b/i],
  ['Work samples', /\bwork samples?\b|\bsamples? of (your )?work\b|\bportfolio\b|\bimages of (your |recent )?work\b/i],
  ['Recommendation letters', /\bletters? of (recommendation|reference|support)\b|\brecommendation letters?\b|\breferees?\b|\breferences\b/i],
  ['Interview', /\binterviews?\b/i],
  ['Writing sample', /\bwriting samples?\b/i],
  ['Timeline / work plan', /\b(timeline|work ?plan|schedule of work)\b/i],
  ['Proof of residence', /\bproof of (residence|residency|address)\b/i],
  ['ID / passport copy', /\b(passport|photo id|identification document) (copy|scan)\b|\bcopy of (your )?(passport|id)\b/i],
  ['Artist talk / open studio', /\b(artist talk|open studio|public presentation)\b/i],
  ['Exhibition at end', /\b(final|closing|culminating) (exhibition|show|presentation)\b/i],
  ['Community engagement', /\bcommunity (engagement|workshop|program(me)?s?|outreach)\b|\bworkshops? (with|for) (the )?(local )?(community|public|students)\b/i],
];

const TYPE_WORDS = [
  ['Residency', /\b(residenc(y|ies)|artists?[- ]in[- ]residence|a\.?i\.?r\.?)\b/i],
  ['Fellowship', /\bfellowships?\b/i],
  ['Grant', /\bgrants?\b|\bfunding (call|programme|program)\b|\bbursar(y|ies)\b/i],
  ['Prize / award', /\b(prize|award|competition|contest)\b/i],
  ['Commission', /\bcommission(s|ing)?\b/i],
  ['Open call', /\b(open call|call for (artists|entries|proposals|submissions|works))\b/i],
];

const AGGREGATORS = /(^|\.)(resartis\.org|rivet\.es|artconnect\.com|artinfoland\.com|artistcommunities\.org|transartists\.org|artenda\.net|on-the-move\.org|artrabbit\.com|e-flux\.com|artjobs\.com|entrythingy\.com|callforentry\.org|artworkarchive\.com|theartlist\.com|artdeadline\.com|culture360\.asef\.org|pineywoodatlas\.com|instagram\.com)$/i;

const word2num = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };

function sentencesOf(text) {
  return [...new Set(String(text || '').split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])|\n+/).map((s) => s.trim()).filter((s) => s.length > 3))];
}
const uniq = (arr) => [...new Set(arr)];

function trimEvidence(s, n = 320) {
  const t = clean(s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function stripSiteSuffix(title, siteName, host) {
  let t = clean(title);
  const parts = t.split(/\s+[|–—·•»]\s+|\s+-\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase();
    const h = (host || '').split('.')[0];
    if ((siteName && last.includes(siteName.toLowerCase().slice(0, 8))) || (h && last.replace(/\s/g, '').includes(h)) || last.length < 22) parts.pop();
    t = parts.join(' – ');
  }
  return t.trim();
}

function toDisciplines(value) {
  const out = [];
  if (ALL_DISCIPLINES.test(value)) out.push('All disciplines');
  for (const [name, re] of DISCIPLINE_WORDS) if (re.test(value) && !out.includes(name)) out.push(name);
  if (!out.length) {
    for (const part of String(value).split(/[,;/•|\n]+/).map((x) => x.trim()).filter((x) => x && x.length < 40)) {
      const known = DISCIPLINES.find((d) => d.toLowerCase() === part.toLowerCase());
      out.push(known || part.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  return out.slice(0, 14);
}

function detectList(text, vocab) {
  return vocab.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function countIn(text) {
  const m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\b/i.exec(text);
  if (!m) return null;
  return word2num[m[1].toLowerCase()] ?? Number(m[1]);
}

// ---------------------------------------------------------------- main

/**
 * @param {string} html
 * @param {string} url
 * @param {{ hints?: object, now?: Date, dateOrder?: 'mdy'|'dmy' }} opts
 * @returns {{ fields: object, pageText: string, title: string, meta: object }}
 */
export function extractOpportunity(html, url, opts = {}) {
  const now = opts.now || new Date();
  const host = hostOf(url);
  opts = { ...opts, aggregator: opts.aggregator ?? AGGREGATORS.test(host) };
  const order = opts.dateOrder || (/\.(com|org|net|us|edu|gov)$/.test(host) ? 'mdy' : 'dmy');
  const root = parseHtml(html);
  const meta = getMeta(root);
  const jsonld = getJsonLd(root);
  const links = getLinks(root, url);
  stripChrome(root);
  const main = mainNode(root);
  const lines = cutAtRelated(toLines(main));
  const pageText = lines.map((l) => l.text).join('\n');
  const pairs = labelPairs(lines);
  const F = {};
  const set = (key, value, text, method, confidence, evidence) => {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
    if (F[key] && F[key].confidence >= confidence) return;
    F[key] = { value, text: text != null ? trimEvidence(text, 600) : undefined, method, confidence, evidence: evidence ? trimEvidence(evidence) : undefined };
  };
  const pairFor = (key) => pairs.filter((p) => p.key === key);
  const dateOpts = { ref: now, order };
  const sentences = sentencesOf(pageText);

  // ---- structured data first
  for (const item of jsonld) {
    const types = [].concat(item['@type'] || []).map(String);
    const ev = `structured data (${types.join(', ')})`;
    if (types.some((t) => /Event|Course|JobPosting|CreativeWork|Grant|Offer/i.test(t))) {
      if (item.name || item.title) set('name', clean(item.name || item.title), null, 'jsonld', 0.85, ev);
      const org = item.organizer?.name || item.hiringOrganization?.name || item.funder?.name || item.provider?.name;
      if (org) set('organization', clean(org), null, 'jsonld', 0.85, ev);
      const loc = item.location || item.jobLocation;
      const addr = loc?.address || loc;
      const locText = [loc?.name, addr?.addressLocality, addr?.addressRegion, addr?.addressCountry?.name || addr?.addressCountry].filter((x) => typeof x === 'string').join(', ');
      if (locText) set('location', clean(locText), null, 'jsonld', 0.8, ev);
      if (/VirtualLocation|OnlineEventAttendanceMode/i.test(JSON.stringify(item.eventAttendanceMode || loc?.['@type'] || ''))) set('mode', 'Online', null, 'jsonld', 0.8, ev);
      if (item.validThrough) { const d = parseDate(item.validThrough, dateOpts); if (d) set('deadline', d.iso, item.validThrough, 'jsonld', 0.85, ev); }
      if (item.startDate) {
        const s = parseDate(item.startDate, dateOpts); const e = item.endDate ? parseDate(item.endDate, dateOpts) : null;
        if (s) set('programDates', { start: s.iso, end: e?.iso || null }, `${item.startDate}${item.endDate ? ` – ${item.endDate}` : ''}`, 'jsonld', 0.75, ev);
      }
      if (item.description && item.description.length > 40) set('description', trimEvidence(item.description, 1500), null, 'jsonld', 0.7, ev);
    }
  }

  // ---- name
  const title = stripSiteSuffix(meta.ogTitle || meta.title || '', meta.siteName, host);
  const h1 = clean(lines.find((l) => l.kind === 'h')?.text || meta.h1 || '');
  const name = h1 && h1.length > 4 && h1.length < 200 && !/^(open calls?|opportunit(y|ies)|residenc(y|ies)|calls?)$/i.test(h1) ? h1 : title;
  if (name) set('name', name, null, h1 === name ? 'heading' : 'title', 0.8, name);
  if (opts.hints?.name) set('name', opts.hints.name, null, 'listing', 0.5, opts.hints.name);

  // ---- organization
  for (const p of pairFor('organization')) set('organization', clean(p.value.split('\n')[0]), null, 'label', 0.8, `${p.label}: ${p.value}`);
  const hIndex = lines.findIndex((l) => l.text === h1);
  if (hIndex >= 0) {
    const nxt = lines[hIndex + 1]?.text || '';
    if (nxt && lines[hIndex + 1].kind !== 'dt' && !labelField(nxt) && nxt.length < 70 && !/[:\d$€£]/.test(nxt) && !/^(open call|residency|grant|deadline|by )/i.test(nxt) && nxt.split(' ').length <= 8) set('organization', nxt, null, 'layout', 0.45, nxt);
  }
  if (meta.siteName && !opts.aggregator) set('organization', meta.siteName, null, 'meta', 0.5, `site name: ${meta.siteName}`);

  // ---- deadline + opening date
  for (const p of pairFor('deadline')) {
    if (ROLLING.test(p.value)) { set('deadline', 'rolling', p.value, 'label', 0.8, `${p.label}: ${p.value}`); continue; }
    const d = parseDate(p.value, dateOpts);
    if (d) set('deadline', d.iso, p.value, 'label', d.hasYear ? 0.88 : 0.6, `${p.label}: ${p.value}`);
  }
  for (const p of pairFor('openingDate')) {
    const d = parseDate(p.value, dateOpts);
    if (d) set('openingDate', d.iso, p.value, 'label', d.hasYear ? 0.85 : 0.6, `${p.label}: ${p.value}`);
  }
  for (const p of pairFor('applicationPeriod')) {
    const r = parseRange(p.value, dateOpts);
    if (r?.start && r.end) {
      set('openingDate', r.start, p.value, 'label', 0.75, `${p.label}: ${p.value}`);
      set('deadline', r.end, p.value, 'label', 0.75, `${p.label}: ${p.value}`);
    }
  }
  if (!F.deadline) {
    for (const s of sentences) {
      if (!/\b(deadline|apply by|applications? (close|due|must be (received|submitted))|due (on|by)|closes on|submit (by|before)|until|no later than|call (is )?open (until|through))\b/i.test(s)) continue;
      if (ROLLING.test(s)) { set('deadline', 'rolling', s, 'pattern', 0.6, s); break; }
      const r = /\bfrom\b.+\b(to|until|through)\b/i.test(s) ? parseRange(s, dateOpts) : null;
      if (r?.end) { set('deadline', r.end, s, 'pattern', 0.6, s); set('openingDate', r.start, s, 'pattern', 0.55, s); break; }
      const d = parseDate(s, dateOpts);
      if (d) { set('deadline', d.iso, s, 'pattern', d.hasYear ? 0.62 : 0.45, s); break; }
    }
  }
  if (!F.deadline && ROLLING.test(pageText.slice(0, 4000))) {
    const s = sentences.find((x) => ROLLING.test(x));
    set('deadline', 'rolling', s, 'pattern', 0.5, s);
  }
  if (!F.openingDate) {
    const s = sentences.find((x) => /\b(applications?|call|submissions?) (open|opens|will open|are open)( on| from)?\b/i.test(x) && !/\b(close|deadline|until)\b/i.test(x));
    const d = s && parseDate(s, dateOpts);
    if (d) set('openingDate', d.iso, s, 'pattern', 0.5, s);
  }
  if (opts.hints?.deadline) set('deadline', opts.hints.deadline, opts.hints.deadlineText, 'listing', 0.55, opts.hints.deadlineText);

  // ---- program dates and duration
  for (const p of pairFor('programDates')) {
    const r = parseRange(p.value, dateOpts);
    if (r) {
      const end = pairFor('programEnd')[0];
      const endD = end ? parseDate(end.value, dateOpts) : null;
      set('programDates', { start: r.start, end: endD?.iso || r.end }, endD ? `${p.value} – ${end.value}` : p.value, 'label', 0.75, `${p.label}: ${p.value}`);
    } else set('duration', clean(p.value.split('\n')[0]), null, 'label', 0.7, `${p.label}: ${p.value}`);
  }
  for (const p of pairFor('duration')) {
    const v = clean(p.value.split('\n')[0]);
    const r = /\d{4}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d/i.test(v) ? parseRange(v, dateOpts) : null;
    if (r?.end) set('programDates', r, v, 'label', 0.7, `${p.label}: ${v}`);
    else set('duration', v, null, 'label', 0.75, `${p.label}: ${v}`);
  }
  if (!F.duration) {
    const s = sentences.find((x) => /\b\d+(\s*[-–]\s*\d+)?\s*(days?|weeks?|months?)\b/i.test(x) && /\b(residenc|stay|program|duration|period|session)/i.test(x));
    if (s) {
      const m = /\b\d+(\s*[-–to]+\s*\d+)?\s*(days?|weeks?|months?)\b/i.exec(s);
      set('duration', m[0], s, 'pattern', 0.5, s);
    }
  }

  // ---- location and format
  for (const p of pairFor('location')) set('location', clean(p.value.split('\n')[0]).slice(0, 160), null, 'label', 0.82, `${p.label}: ${p.value}`);
  if (opts.hints?.location) set('location', opts.hints.location, null, 'listing', 0.6, opts.hints.location);
  if (!F.location) {
    const paren = /\(([^()]{3,80})\)\s*$/.exec(name || '');
    const places = paren ? findPlaces(paren[1]) : [];
    if (places.length) set('location', paren[1], null, 'title', 0.55, name);
  }
  if (!F.location) {
    const first = lines.slice(0, 12).map((l) => l.text).find((t) => t.length < 80 && findPlaces(t).length && !/\b(deadline|open to|citizens?|residents?|dollars?|euros?|fee|stipend)\b|[$€£\d]{2}/i.test(t) && !labelField(t));
    if (first) set('location', first, null, 'layout', 0.4, first);
  }
  const locText = F.location?.value || '';
  const onlineRe = /\b(virtual|online|remote|digital) (residenc(y|ies)|program(me)?|fellowship|artist[- ]in[- ]residence)\b|\bresidency (is|takes place) (fully |entirely )?(online|virtual|remote)\b/i;
  if (/^(online|virtual|remote|internet|worldwide \(online\))$/i.test(locText.trim())) set('mode', 'Online', locText, 'label', 0.85, locText);
  else if (/\bhybrid\b/i.test(locText) || /\bhybrid (residenc|program|format)/i.test(pageText)) set('mode', 'Hybrid', null, 'pattern', 0.6, sentences.find((s) => /hybrid/i.test(s)));
  else if (onlineRe.test(`${name}\n${pageText.slice(0, 6000)}`) && !/\bin[- ]person\b/i.test(pageText.slice(0, 6000))) set('mode', 'Online', null, 'pattern', 0.6, sentences.find((s) => onlineRe.test(s)) || name);
  else if (F.location) set('mode', 'In person', null, 'inferred', 0.45, 'Has a physical location');

  // ---- disciplines
  for (const p of pairFor('discipline')) set('discipline', toDisciplines(p.value), p.value, 'label', 0.8, `${p.label}: ${p.value}`);
  if (!F.discipline) {
    const top = pageText.slice(0, 8000);
    const d = ALL_DISCIPLINES.test(top) ? ['All disciplines'] : detectList(top, DISCIPLINE_WORDS).slice(0, 8);
    if (d.length) set('discipline', d, null, 'keywords', 0.45, 'Words used on the page');
  }

  // ---- eligibility
  for (const p of pairFor('eligibility')) set('eligibility', p.value, null, 'label', 0.8, `${p.label}: ${p.value}`);
  if (!F.eligibility) {
    const ss = sentences.filter((s) => /\b(eligib|open to|who can apply|must be|applicants? (must|should)|only (open|available)|citizens? of|residents? of|based in|aged? \d|years of age|over 18|emerging|early[- ]career|students? (are|may|must))\b/i.test(s)).slice(0, 4);
    if (ss.length) set('eligibility', ss.join(' '), null, 'pattern', 0.5, ss[0]);
  }

  // ---- fees
  const feeSection = pairFor('feesAndSupport').map((p) => p.value).join('\n');
  for (const p of pairFor('applicationFee')) {
    const m = parseMoney(p.value);
    if (m) set('applicationFee', { amount: m.amount, currency: m.currency }, p.value, 'label', 0.85, `${p.label}: ${p.value}`);
    else if (/^\s*(yes|required)\b/i.test(p.value)) set('applicationFee', null, p.value, 'label', 0.4, `${p.label}: ${p.value}`);
  }
  if (!F.applicationFee) {
    const s = sentences.find((x) => /\b(application|entry|submission|processing|jury(ing)?|non[- ]refundable) fees?\b|\bfee to apply\b|\bfees?:/i.test(x) && (parseMoney(x) || FREE.test(x)));
    const m = s && parseMoney(s);
    if (m) set('applicationFee', { amount: m.amount, currency: m.currency }, s, 'pattern', 0.65, s);
    else if (FREE.test(pageText) && /\b(no|free)\b.{0,20}\b(application|entry|to apply)/i.test(pageText)) {
      const s2 = sentences.find((x) => FREE.test(x));
      set('applicationFee', { amount: 0, currency: null }, s2, 'pattern', 0.55, s2);
    }
  }
  if (opts.hints?.fee) set('applicationFee', opts.hints.fee, opts.hints.feeText, 'listing', 0.55, opts.hints.feeText);
  for (const p of pairFor('programFee')) {
    const m = parseMoney(p.value);
    if (m) set('programFee', { amount: m.amount, currency: m.currency }, p.value, 'label', 0.75, `${p.label}: ${p.value}`);
  }
  if (!F.programFee) {
    const s = sentences.concat(sentencesOf(feeSection)).find((x) => /\b(residency|program(me)?|participation|studio|accommodation) (fee|cost)s?\b|\bcost of (the )?(residency|program)\b|\bartists? (pay|are charged)\b/i.test(x) && parseMoney(x, { freeAllowed: false }));
    const m = s && parseMoney(s, { freeAllowed: false });
    if (m) set('programFee', { amount: m.amount, currency: m.currency }, s, 'pattern', 0.6, s);
  }

  // ---- funding
  const fundingPairs = pairFor('funding');
  const fundingText = fundingPairs.map((p) => p.value).concat(feeSection).join('\n');
  const fundingFromLabels = detectList(fundingText, FUNDING_WORDS);
  if (fundingFromLabels.length) set('fundingType', fundingFromLabels, fundingText, 'label', 0.72, fundingText.slice(0, 300));
  const fundingAll = detectList(pageText, FUNDING_WORDS).filter((x) => !(x === 'No funding' && /\bno funding (required|needed)/i.test(pageText)));
  if (fundingAll.length) set('fundingType', fundingAll, null, 'keywords', 0.55, 'Words used on the page');
  const stipendSentence = sentences.concat(sentencesOf(fundingText)).find((x) => /\b(stipend|honorari|award|grant|prize|fee of|artist fee|allowance|per diem|receive|reimburse)/i.test(x) && allMoney(x).length);
  if (stipendSentence) set('fundingAmount', trimEvidence(stipendSentence, 220), null, 'pattern', 0.6, stipendSentence);
  for (const p of fundingPairs) {
    if (allMoney(p.value).length) set('fundingAmount', trimEvidence(`${p.label}: ${p.value}`, 220), null, 'label', 0.7, `${p.label}: ${p.value}`);
  }
  const restr = sentences.filter((x) => /\b(stipend|funding|grant|travel|reimburs|allowance|budget|fees?|costs?)\b/i.test(x) && /\b(only|must|cannot|can not|not (be )?(cover|include|provide|reimburse)|does not|do not|exclud|up to|maximum|max\.|receipts|upon|after (the )?(residency|completion)|in (two|2) install|taxable|non[- ]refundable|responsible for)\b/i.test(x)).slice(0, 4);
  if (restr.length) set('fundingRestrictions', restr.join(' '), null, 'pattern', 0.5, restr[0]);

  // ---- requirements, samples, letters
  const reqPairs = pairFor('requirements');
  const reqText = reqPairs.map((p) => p.value).join('\n');
  if (reqText) set('requirements', detectList(reqText, REQUIREMENT_WORDS), reqText, 'label', 0.72, reqText.slice(0, 300));
  const reqAll = detectList(pageText, REQUIREMENT_WORDS);
  if (reqAll.length) set('requirements', reqAll, null, 'keywords', 0.5, 'Words used on the page');
  for (const p of pairFor('workSamples')) set('workSamples', p.value, null, 'label', 0.78, `${p.label}: ${p.value}`);
  if (!F.workSamples) {
    const ss = uniq(sentences.concat(sentencesOf(reqText))).filter((x) => /\b(work samples?|samples? of (your )?work|portfolio|up to \d+ (images|works|photos)|\d+\s*[-–]\s*\d+ (images|works)|images of (your )?(recent )?work|video (excerpt|sample|link|documentation)|audio (sample|excerpt|file)s?|links? to (your )?(work|video|audio))\b/i.test(x)).slice(0, 3);
    if (ss.length) set('workSamples', ss.join(' '), null, 'pattern', 0.55, ss[0]);
  }
  for (const p of pairFor('recommendations')) {
    set('recommendations', trimEvidence(p.value, 300), null, 'label', 0.75, `${p.label}: ${p.value}`);
  }
  if (!F.recommendations) {
    const s = sentences.find((x) => /\b(letters? of (recommendation|reference|support)|recommendation letters?|referees?|references?)\b/i.test(x) && !/\bfor reference\b/i.test(x));
    if (s) {
      const n = countIn(s);
      const none = /\b(no|not required|without)\b.{0,30}\b(letters?|references?)\b|\b(letters?|references?) (are )?not required\b/i.test(s);
      set('recommendations', none ? 'Not required' : n ? `${n} — ${trimEvidence(s, 200)}` : trimEvidence(s, 220), null, 'pattern', 0.55, s);
    }
  }

  // ---- type
  for (const p of pairFor('type')) {
    const t = detectList(p.value, TYPE_WORDS)[0];
    if (t) set('type', t, p.value, 'label', 0.8, `${p.label}: ${p.value}`);
  }
  let typeFromName = detectList(name || '', TYPE_WORDS)[0];
  if (typeFromName === 'Open call') typeFromName = detectList(`${name}\n${pageText.slice(0, 3000)}`, TYPE_WORDS.filter(([t]) => t !== 'Open call'))[0] || typeFromName;
  if (typeFromName) set('type', typeFromName, null, 'title', 0.65, name);
  const typeFromText = detectList(pageText.slice(0, 3000), TYPE_WORDS)[0];
  if (typeFromText) set('type', typeFromText, null, 'keywords', 0.45, 'Words used on the page');

  // ---- residency focus (time and space, project-based, …)
  const focus = detectFocus(pageText, { type: F.type?.value });
  if (focus) set('focus', focus.value, focus.text, 'wording', focus.confidence, focus.evidence);

  // ---- links, contact, language
  const external = links.filter((l) => hostOf(l.url) && hostOf(l.url) !== host);
  const applyLink = links.find((l) => /\b(apply|application form|submit (your )?(application|work)|apply now|apply here|submittable|slideroom|callforentry|cafe)\b/i.test(`${l.text} ${l.url}`) && !/login|signin|sign-in|register|signup/i.test(l.url));
  if (applyLink) set('applyUrl', applyLink.url, applyLink.text, 'link', applyLink.url.includes(host) ? 0.5 : 0.65, `Link: ${applyLink.text || applyLink.url}`);
  const viaText = /\b(apply|submit|application)[^.\n]{0,40}(https?:\/\/[^\s)>"']+)/i.exec(pageText);
  if (viaText) set('applyUrl', viaText[2].replace(/[.,;]+$/, ''), viaText[0], 'pattern', 0.7, viaText[0]);
  for (const p of pairFor('applyUrl')) {
    const u = /https?:\/\/[^\s)>"']+/.exec(p.value)?.[0];
    if (u) set('applyUrl', u, null, 'label', 0.75, `${p.label}: ${p.value}`);
  }
  for (const p of pairFor('website')) {
    const u = /https?:\/\/[^\s)>"']+/.exec(p.value)?.[0] || (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(p.value.trim()) ? `https://${p.value.trim()}` : null);
    if (u) set('website', u, null, 'label', 0.8, `${p.label}: ${p.value}`);
  }
  if (!F.website) {
    const site = external.find((l) => /\b(website|visit|more info(rmation)?|official|homepage|learn more|read more)\b/i.test(l.text) && !/(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|mailto)/i.test(l.url));
    if (site) set('website', site.url, site.text, 'link', 0.55, `Link: ${site.text}`);
  }
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+\b/.exec(pageText);
  if (email && !/example\.|sentry|wixpress/i.test(email[0])) set('contact', email[0], null, 'pattern', 0.5, email[0]);
  for (const p of pairFor('contact')) set('contact', clean(p.value.split('\n')[0]).slice(0, 160), null, 'label', 0.75, `${p.label}: ${p.value}`);
  for (const p of pairFor('language')) set('language', clean(p.value.split('\n')[0]).slice(0, 100), null, 'label', 0.75, `${p.label}: ${p.value}`);

  // ---- description
  const paras = lines.filter((l) => l.kind === 'p' && l.text.length > 80 && !/cookie|javascript|subscribe/i.test(l.text)).map((l) => l.text);
  if (paras.length) set('description', trimEvidence(paras.slice(0, 4).join('\n\n'), 1500), null, 'page', 0.6, paras[0]);
  if (meta.description && meta.description.length > 40) set('description', meta.description, null, 'meta', 0.55, meta.description);

  return { fields: F, pageText: pageText.slice(0, 60000), title: name || title, meta, links: links.map(({ url: u, text }) => ({ url: u, text })) };
}

/** Quick hints from the card around a link on a listing page: deadline, location, fee. */
export function listingHints(contextText, { now = new Date(), order = 'mdy' } = {}) {
  const hints = {};
  const lines = String(contextText || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return hints;
  hints.name = lines[0].length < 200 ? lines[0] : undefined;
  const dlLine = lines.find((l) => /deadline|closes|due|apply by/i.test(l)) || lines.find((l) => parseDate(l, { ref: now, order }));
  if (dlLine) {
    if (ROLLING.test(dlLine)) { hints.deadline = 'rolling'; hints.deadlineText = dlLine; }
    else {
      const d = parseDate(dlLine.replace(/^.*?(deadline|closes|due|apply by)\s*:?/i, ''), { ref: now, order }) || parseDate(dlLine, { ref: now, order });
      if (d && d.hasYear) { hints.deadline = d.iso; hints.deadlineText = dlLine; }
    }
  }
  const locLine = lines.slice(1).find((l) => l.length < 90 && findPlaces(l).length && !/deadline/i.test(l));
  if (locLine) hints.location = locLine.replace(/^(location|where)\s*:\s*/i, '');
  const feeLine = lines.find((l) => /\bfees?\b|free entry|free to apply/i.test(l));
  if (feeLine) {
    const m = parseMoney(feeLine);
    if (m) { hints.fee = { amount: m.amount, currency: m.currency }; hints.feeText = feeLine; }
  }
  return hints;
}
