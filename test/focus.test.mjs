// Residency focus: telling time-and-space residencies from ones that expect a project or duties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectFocus } from '../src/main/extract/focus.mjs';
import { extractOpportunity } from '../src/main/extract/heuristics.mjs';
import { buildOpportunity, mergeExtraction, setManualField } from '../src/main/opportunities.mjs';
import { matchesFocus, FOCUS_FILTERS, fieldStatus } from '../src/shared/schema.mjs';
import { Database } from '../src/main/db.mjs';
import { aiExtract } from '../src/main/aitasks.mjs';

const NOW = new Date('2026-11-18T12:00:00');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-focus-'));
const focus = (text, type = 'Residency') => detectFocus(text, { type });

test('recognises time-and-space residencies from their wording', () => {
  const obras = focus('OBRAS offers artists and researchers time, space, and solitude for sustained, self-directed work.\nResidents are given space and time to focus on their practice without prescribed outcomes or formal program requirements.');
  assert.equal(obras.value, 'Time and space');
  assert.ok(obras.confidence >= 0.7);
  assert.match(obras.text, /without prescribed outcomes/);
  assert.match(obras.text, /No required project/);

  const aac = focus('Self-Directed Residencies\nPort Townsend, WA\nAdditional Expectations/Opportunities\nN/A\nHow does your residency program support artists?');
  assert.equal(aac.value, 'Time and space');

  const optional = focus('The residency provides time and space to work. Residents are welcome to give an informal talk, but there is no obligation to produce finished work.');
  assert.equal(optional.value, 'Time and space');

  const negated = focus('Residents are not required to exhibit or present anything at the end of their stay.');
  assert.equal(negated.value, 'Time and space');
});

test('a light talk or open studio keeps a residency time and space, with a note', () => {
  const r = focus('The Time and Space Residency Program is an immersive studio experience.\nAdditional Expectations/Opportunities\nParticipate in open studio with fellow residents\nGive artist talk or presentation');
  assert.equal(r.value, 'Time and space');
  assert.equal(r.confidence, 0.6);
  assert.match(r.text, /also mentions .*open studio/);
});

test('a bare "time and space" phrase is only a guess', () => {
  const r = focus('Our residency gives artists time and space to make new work in the mountains.');
  assert.equal(r.value, 'Time and space');
  assert.ok(r.confidence < 0.6);
  const fv = { value: r.value, origin: 'extracted', confidence: r.confidence, extractedAt: NOW.toISOString(), checkedAt: NOW.toISOString() };
  assert.equal(fieldStatus(fv, { now: NOW.getTime() }).label, 'Uncertain — verify');
});

test('recognises project-based, engagement and work-exchange residencies', () => {
  assert.equal(focus('The residency is project-based. Selected artists are expected to realize the proposed project and present their work at a final exhibition.').value, 'Project-based');
  assert.equal(focus('Artists in residence are required to lead two community workshops and give a public talk.').value, 'Public engagement');
  assert.equal(focus('Studio space to pursue their art. We ask, in exchange, for 12 hours per week from artists, to help renovate and maintain the grounds.').value, 'Work exchange');
  assert.equal(focus('Residents must donate a work of art to the collection at the end of the residency.').value, 'Project-based');
  // Time and space wording with a real teaching load: flagged as engagement, but unsure.
  const mixed = focus('A self-directed residency offering time and space. Residents are required to teach a weekly class for local students.');
  assert.equal(mixed.value, 'Public engagement');
  assert.ok(mixed.confidence < 0.6);
});

test('ordinary application wording is not mistaken for duties', () => {
  assert.equal(focus('Applicants must create an account on SlideRoom. Applicants are required to submit a CV and share a kitchen. Studios are open 24 hours a day for work.'), null);
  assert.equal(focus('Deadline March 1. Fee $25. Open to all disciplines.'), null);
  // Grants only get a focus when they are about a residency.
  assert.equal(focus('This project grant funds artists to produce new work. Grantees must complete the funded project within a year.', 'Grant'), null);
});

test('pages read with extractOpportunity get a residency focus with its evidence', () => {
  const html = `<html><head><title>Self-Directed Residencies (2027)</title></head><body><main>
    <h1>Self-Directed Residencies (2027)</h1>
    <p>Artists of all disciplines are encouraged to customize their time and conduct self-directed residencies in one to four week sessions.</p>
    <dl><dt>Deadline</dt><dd>March 1, 2027</dd><dt>Additional Expectations/Opportunities</dt><dd>N/A</dd></dl>
  </main></body></html>`;
  const { fields: f } = extractOpportunity(html, 'https://artistcommunities.org/node/3738', { now: NOW, aggregator: true });
  assert.equal(f.focus.value, 'Time and space');
  assert.equal(f.focus.method, 'wording');
  assert.ok(f.focus.evidence);
});

test('a focus you set is never replaced by a re-check', () => {
  const url = 'https://example.org/res';
  const page = (body) => `<html><body><main><h1>Hill Residency</h1><p>${body}</p></main></body></html>`;
  const opp = buildOpportunity({ url, extraction: extractOpportunity(page('Residents are given time and space without prescribed outcomes.'), url, { now: NOW }), origin: {} });
  assert.equal(opp.fields.focus.value, 'Time and space');
  setManualField(opp, 'focus', { value: 'Public engagement' });
  const r = mergeExtraction(opp, extractOpportunity(page('A self-directed residency with no required outcomes or deliverables.'), url, { now: NOW }), { url });
  assert.equal(opp.fields.focus.value, 'Public engagement');
  assert.ok(!r.changed.includes('focus'));
});

test('the focus filter', () => {
  const o = (focusValue, type = 'Residency') => ({ fields: { type: { value: type }, ...(focusValue ? { focus: { value: focusValue } } : {}) } });
  assert.deepEqual(FOCUS_FILTERS.map((x) => x.value), ['', 'timespace', 'timespace-open', 'duties']);
  assert.ok(matchesFocus(o('Time and space'), 'timespace'));
  assert.ok(!matchesFocus(o(null), 'timespace'));
  assert.ok(matchesFocus(o(null), 'timespace-open'));
  assert.ok(!matchesFocus(o(null, 'Grant'), 'timespace-open'));
  assert.ok(!matchesFocus(o('Project-based'), 'timespace-open'));
  assert.ok(matchesFocus(o('Work exchange'), 'duties'));
  assert.ok(!matchesFocus(o('Time and space'), 'duties'));
  assert.ok(matchesFocus(o(null), ''));
});

test('opportunities saved before 1.1 get a focus once, from the text Atelier already has', () => {
  const dir = tmp();
  const at = '2026-11-10T10:00:00.000Z';
  const items = [
    { id: 'opp_a', url: 'https://a.example/res', status: 'saved', fields: { name: { value: 'A', origin: 'extracted' } }, pageExcerpt: 'A self-directed residency with time and space and no required outcomes.', check: { lastCheckedAt: at } },
    { id: 'opp_b', url: 'https://b.example/res', status: 'saved', fields: { name: { value: 'B', origin: 'manual' }, focus: { value: 'Project-based', origin: 'manual' } }, pageExcerpt: 'Time and space without prescribed outcomes.' },
    { id: 'opp_c', url: 'https://c.example/grant', status: 'new', fields: { type: { value: 'Grant' } }, pageExcerpt: 'Grants of $5,000.' },
  ];
  fs.writeFileSync(path.join(dir, 'opportunities.json'), JSON.stringify({ schemaVersion: 1, items }));
  const db = new Database(dir);
  const a = db.get('opportunities', 'opp_a').fields.focus;
  assert.equal(a.value, 'Time and space');
  assert.equal(a.origin, 'extracted');
  assert.equal(a.checkedAt, at);
  assert.equal(db.get('opportunities', 'opp_b').fields.focus.value, 'Project-based');
  assert.equal(db.get('opportunities', 'opp_c').fields.focus, undefined);
  // Runs once: a focus you later clear stays cleared.
  db.update('opportunities', 'opp_a', (o) => { delete o.fields.focus; });
  db.flushAll();
  const db2 = new Database(dir);
  assert.equal(db2.get('opportunities', 'opp_a').fields.focus, undefined);
});

test('AI extraction only accepts the listed focus choices', async () => {
  const assistant = { complete: async () => ({ json: { fields: {
    focus: { value: 'time & space', quote: 'no required outcomes' },
    mode: { value: 'in-person', quote: 'on site' },
    type: { value: 'Retreat', quote: 'a retreat' },
  } } }) };
  const { fields } = await aiExtract(assistant, { url: 'https://x.example', pageText: 'A residency on site with no required outcomes. A retreat.' });
  assert.equal(fields.focus.value, 'Time and space');
  assert.equal(fields.mode.value, 'In person');
  assert.equal(fields.type, undefined);
});
