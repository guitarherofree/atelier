// What the optional AI does, and exactly what each request contains. Every function here receives only
// the pieces it needs; nothing else from your data is sent.
import { OPP_FIELDS, fieldText, oppName, PROPOSAL_SECTIONS, wordCount } from '../shared/schema.mjs';

const FIELD_KEYS = OPP_FIELDS.map((f) => f.key);

function oppSummary(opp, { includePage = true } = {}) {
  const lines = [`Name: ${oppName(opp)}`];
  for (const f of OPP_FIELDS) {
    if (f.key === 'name' || f.key === 'description') continue;
    const t = fieldText(f.key, opp.fields?.[f.key]);
    if (t) lines.push(`${f.label}: ${t}`);
  }
  const desc = fieldText('description', opp.fields?.description);
  if (desc) lines.push(`Description: ${desc}`);
  if (includePage && opp.pageExcerpt) lines.push(`\nPage text (excerpt):\n${opp.pageExcerpt.slice(0, 7000)}`);
  return lines.join('\n');
}

export function profileSummary(profile) {
  const p = profile || {};
  const pr = p.prefs || {};
  return [
    p.name && `Artist: ${p.name}`,
    p.basedIn && `Based in: ${p.basedIn}`,
    p.countries?.length && `Citizenship / residency: ${p.countries.join(', ')}`,
    p.careerStage && `Career stage: ${p.careerStage}`,
    p.disciplines?.length && `Disciplines: ${p.disciplines.join(', ')}`,
    p.mediums?.length && `Mediums: ${p.mediums.join(', ')}`,
    p.themes?.length && `Themes: ${p.themes.join(', ')}`,
    p.goals && `Goals: ${p.goals}`,
    p.goalTags?.length && `Goal keywords: ${p.goalTags.join(', ')}`,
    pr.funding && `Funding preference: ${pr.funding}`,
    pr.formats?.length && `Formats acceptable: ${pr.formats.join(', ')}`,
    pr.needs?.length && `Needs: ${pr.needs.join(', ')}`,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- extraction

export async function aiExtract(assistant, { url, pageText, name }) {
  const keys = FIELD_KEYS.filter((k) => k !== 'description');
  const system = 'You extract facts about an artist opportunity (residency, grant, open call) from a web page. Only report what the page states. Never guess. For each field give the exact supporting quote from the page.';
  const prompt = `Page URL: ${url}\nPage title: ${name || ''}\n\nPage text:\n"""\n${String(pageText || '').slice(0, 24000)}\n"""\n\n` +
    `Return JSON: {"fields": {<field>: {"value": ..., "quote": "exact words from the page"}}} using only these fields when the page states them:\n` +
    `${keys.join(', ')}.\n` +
    'Formats: deadline and openingDate as YYYY-MM-DD (or "rolling"); applicationFee and programFee as {"amount": number, "currency": "USD"} (amount 0 when free); ' +
    'discipline, fundingType and requirements as arrays of short strings; mode as "In person", "Online" or "Hybrid"; type as one of Residency, Grant, Fellowship, Open call, Prize / award, Commission, Other; everything else as a short string. Omit fields the page does not state.';
  const r = await assistant.complete({ system, prompt, json: true, maxTokens: 2500, purpose: 'extract details' });
  const fields = {};
  const raw = r.json?.fields || {};
  const pageLower = String(pageText || '').toLowerCase().replace(/\s+/g, ' ');
  for (const [k, v] of Object.entries(raw)) {
    if (!keys.includes(k) || v == null) continue;
    const value = v && typeof v === 'object' && 'value' in v ? v.value : v;
    const quote = v?.quote ? String(v.quote).slice(0, 400) : '';
    if (value == null || value === '') continue;
    // A quote that isn't actually on the page lowers confidence.
    const found = quote && pageLower.includes(quote.toLowerCase().replace(/\s+/g, ' ').slice(0, 60));
    fields[k] = { value, text: typeof value === 'string' ? value : undefined, method: 'ai', confidence: found ? 0.72 : 0.5, evidence: quote || 'No quote given' };
  }
  return { fields };
}

// ---------------------------------------------------------------- fit

export async function aiFit(assistant, { opp, profile, ruleReasons }) {
  const system = 'You help an artist decide whether to apply to an opportunity. Be concrete and brief. Ground every point in the opportunity text or the artist profile. Say plainly when information is missing. Do not invent facts.';
  const prompt = `ARTIST PROFILE\n${profileSummary(profile)}\n\nOPPORTUNITY\n${oppSummary(opp)}\n\n` +
    `Atelier's rule-based checks found:\n${(ruleReasons || []).map((r) => `- [${r.tone}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`).join('\n') || '- (none)'}\n\n` +
    'Write: one sentence verdict; then "Why it fits" (2–4 bullets); then "Concerns or unknowns" (2–4 bullets); then "If you apply, emphasize" (1–3 bullets). Plain text with "-" bullets, no markdown headings beyond those labels.';
  const r = await assistant.complete({ system, prompt, maxTokens: 900, purpose: 'explain fit' });
  return { text: r.text.trim() };
}

// ---------------------------------------------------------------- proposals

export async function aiTailor(assistant, { proposal, opp, profile, suggestions }) {
  const sections = PROPOSAL_SECTIONS.filter((s) => (proposal.sections?.[s.key] || '').trim());
  const system = 'You are an experienced editor of artist residency and grant applications. You tailor an existing proposal to one opportunity without inventing facts about the artist or the project. Keep the artist’s voice. Do not add achievements, collaborators, or numbers that are not in the original.';
  const prompt = `ARTIST PROFILE\n${profileSummary(profile)}\n\nOPPORTUNITY\n${oppSummary(opp)}\n\nORIGINAL PROPOSAL "${proposal.title}"\n` +
    sections.map((s) => `### ${s.key}\n${proposal.sections[s.key]}`).join('\n\n') +
    `\n\nChecklist notes from Atelier:\n${(suggestions || []).map((s) => `- (${s.section}) ${s.text}`).join('\n') || '- none'}\n\n` +
    'Return JSON: {"sections": {<section key>: "tailored text"}, "notes": [{"section": <key>, "change": "what you changed", "reason": "why, citing the call"}]}. ' +
    `Use only these section keys: ${sections.map((s) => s.key).join(', ')}. Keep each section close to its original length unless the call clearly needs more. If a section needs facts only the artist knows, write [ADD: what is needed] instead of inventing.`;
  const r = await assistant.complete({ system, prompt, json: true, maxTokens: 4000, purpose: 'tailor proposal' });
  const out = { sections: {}, notes: [] };
  for (const s of sections) {
    const v = r.json?.sections?.[s.key];
    if (typeof v === 'string' && v.trim()) out.sections[s.key] = v.trim();
  }
  out.notes = Array.isArray(r.json?.notes) ? r.json.notes.filter((n) => n && n.change).slice(0, 20) : [];
  if (!Object.keys(out.sections).length) throw new Error('The AI reply didn’t include usable sections. Try again, or tailor by hand with the checklist.');
  return out;
}

export async function aiDraftAnswer(assistant, { question, limit, opp, profile, proposalText, snippets, notes }) {
  const limitText = limit?.words ? `at most ${limit.words} words` : limit?.chars ? `at most ${limit.chars} characters` : 'a length that suits an application form';
  const system = 'You draft answers to artist application questions using only the material provided. Never invent facts, exhibitions, awards, dates, or people. Where something is missing, write [ADD: …]. Write in the first person, plainly, without clichés.';
  const prompt = `QUESTION\n${question}\n\nLENGTH\n${limitText}\n\nARTIST PROFILE\n${profileSummary(profile)}\n\n` +
    (opp ? `OPPORTUNITY\n${oppSummary(opp, { includePage: false })}\n\n` : '') +
    (proposalText ? `PROJECT PROPOSAL\n${proposalText.slice(0, 8000)}\n\n` : '') +
    (snippets?.length ? `SAVED TEXT\n${snippets.map((s) => `--- ${s.title}\n${s.text}`).join('\n').slice(0, 8000)}\n\n` : '') +
    (notes ? `ARTIST'S NOTES FOR THIS ANSWER\n${notes}\n\n` : '') +
    'Write only the answer text.';
  const r = await assistant.complete({ system, prompt, maxTokens: 1500, purpose: 'draft answer' });
  return { text: r.text.trim() };
}

export async function aiShorten(assistant, { text, limit }) {
  const target = limit?.words ? `${limit.words} words` : `${limit?.chars || 1000} characters`;
  const current = limit?.words ? `${wordCount(text)} words` : `${[...text].length} characters`;
  const system = 'You shorten application text without changing its meaning, facts, or voice.';
  const prompt = `Shorten this from ${current} to at most ${target}. Keep the most specific details. Return only the text.\n\n${text}`;
  const r = await assistant.complete({ system, prompt, maxTokens: 1500, purpose: 'shorten text' });
  return { text: r.text.trim() };
}

// ---------------------------------------------------------------- broader search

export async function aiSearch(assistant, { query, profile, exclude = [] }) {
  const system = 'You search the web for current open calls for artists: residencies, grants, fellowships. Only return opportunities whose application deadline is in the future or that accept rolling applications. Prefer the organizer’s own page over aggregators.';
  const prompt = `Find up to 12 current opportunities for this artist.\n\nSEARCH\n${query}\n\nARTIST\n${profileSummary(profile)}\n\n` +
    (exclude.length ? `Skip these URLs (already known):\n${exclude.slice(0, 80).join('\n')}\n\n` : '') +
    'Return JSON: [{"name": ..., "organization": ..., "url": "page about this opportunity", "deadline": "YYYY-MM-DD or rolling or unknown", "location": ..., "why": "one sentence on why it may fit"}].';
  const r = await assistant.complete({ system, prompt, json: true, maxTokens: 3500, purpose: 'web search', webSearch: true });
  const list = Array.isArray(r.json) ? r.json : Array.isArray(r.json?.results) ? r.json.results : [];
  return {
    results: list.filter((x) => x && /^https?:\/\//.test(x.url || '')).map((x) => ({
      title: String(x.name || x.url), url: x.url, snippet: [x.organization, x.location, x.deadline && `Deadline: ${x.deadline}`].filter(Boolean).join(' · '), why: x.why || '',
    })),
    sources: r.sources,
  };
}
