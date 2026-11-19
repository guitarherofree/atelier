// Unit tests for Atelier's engine: reading pages, provenance and re-checks, fit, discovery, calendar, backups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOpportunity, labelPairs } from '../src/main/extract/heuristics.mjs';
import { parseDate, parseRange } from '../src/main/extract/dates.mjs';
import { parseMoney } from '../src/main/extract/money.mjs';
import { buildOpportunity, mergeExtraction, setManualField, verifyField, acceptSiteValue, similarNames } from '../src/main/opportunities.mjs';
import { fieldStatus, verifyCount, deadlineOf } from '../src/shared/schema.mjs';
import { assessFit, parseWeeks } from '../src/shared/fit.mjs';
import { findPlaces, placeMatches } from '../src/shared/geo.mjs';
import { tailoringSuggestions } from '../src/shared/tailor.mjs';
import { calendarItems } from '../src/shared/calendar.mjs';
import { buildIcs } from '../src/main/ics.mjs';
import { Fetcher } from '../src/main/net/fetcher.mjs';
import { Discovery, learnPattern } from '../src/main/discovery/crawler.mjs';
import { Snapshots } from '../src/main/discovery/snapshots.mjs';
import { parseFeed } from '../src/main/discovery/feeds.mjs';
import { Database } from '../src/main/db.mjs';
import { Backups } from '../src/main/backup.mjs';
import { buildReview, reviewHash, sampleLimit } from '../src/main/submission.mjs';
import { parseJsonLoose } from '../src/main/ai.mjs';
import { getLinks, parseHtml } from '../src/main/extract/html.mjs';
import { startFixtureServer, fixtureSources } from './fixture-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = (n) => fs.readFileSync(path.join(here, 'fixtures/pages', `${n}.html`), 'utf8');
const NOW = new Date('2026-11-18T12:00:00');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-test-'));

// ---------------------------------------------------------------- reading pages

test('reads a Res Artis-style page (definition list, headings)', () => {
  const { fields: f } = extractOpportunity(page('resartis'), 'https://resartis.org/open-call/x/', { now: NOW, aggregator: true });
  assert.equal(f.name.value, 'Porte Rouge Open Call May 2027');
  assert.equal(f.deadline.value, '2027-02-01');
  assert.equal(f.deadline.method, 'label');
  assert.deepEqual(f.programDates.value, { start: '2027-05-03', end: '2027-05-31' });
  assert.equal(f.location.value, 'Burgundy, France');
  assert.deepEqual(f.applicationFee.value, { amount: 20, currency: 'EUR' });
  assert.ok(f.fundingType.value.includes('Stipend'));
  assert.ok(f.fundingType.value.includes('Travel'));
  assert.ok(f.requirements.value.includes('CV / résumé'));
  assert.ok(f.requirements.value.includes('Recommendation letters'));
  assert.match(f.recommendations.value, /^2/);
  assert.match(f.eligibility.value, /aged 21 or older/);
  assert.equal(f.website.value, 'https://porterouge.example.org');
  assert.equal(f.type.value, 'Residency');
  assert.notEqual(f.organization?.value, 'Application deadline');
  assert.ok(f.deadline.evidence.includes('2027-02-01'));
});

test('reads a Rivet-style page (heading labels, program fee, no funding)', () => {
  const { fields: f } = extractOpportunity(page('rivet'), 'https://rivet.es/calls/view/x', { now: NOW, aggregator: true });
  assert.equal(f.deadline.value, '2027-01-15');
  assert.deepEqual(f.programDates.value, { start: '2027-03-01', end: '2027-03-28' });
  assert.deepEqual(f.programFee.value, { amount: 650, currency: 'EUR' });
  assert.ok(f.fundingType.value.includes('No funding'));
  assert.equal(f.organization.value, 'Listening Station Foundation');
  assert.equal(f.applyUrl.value, 'https://forms.example.com/soundfield');
  assert.match(f.location.value, /Lisbon, Portugal/);
});

test('reads an ArtConnect-style page (colon labels, FREE fee, artistic fields)', () => {
  const { fields: f } = extractOpportunity(page('artconnect'), 'https://artconnect.com/opportunity/abc', { now: NOW, aggregator: true });
  assert.equal(f.deadline.value, '2027-06-21');
  assert.deepEqual(f.applicationFee.value, { amount: 0, currency: null });
  assert.equal(f.location.value, 'Berlin, Germany');
  assert.ok(f.discipline.value.includes('Sound art'));
  assert.equal(f.type.value, 'Residency');
});

test('reads an Artist Communities Alliance-style page and never mistakes "US Dollar" for a place', () => {
  const { fields: f } = extractOpportunity(page('aca'), 'https://artistcommunities.org/node/1', { now: NOW, aggregator: true });
  assert.equal(f.deadline.value, '2026-12-15');
  assert.deepEqual(f.applicationFee.value, { amount: 40, currency: 'USD' });
  assert.equal(f.organization.value, 'Hillside Studios');
  assert.ok(!f.location || !/dollar/i.test(f.location.value));
  assert.match(f.fundingAmount.value, /1250/);
});

test('recognises online opportunities and splits sentences with labels', () => {
  const { fields: f } = extractOpportunity(page('online'), 'https://signal.example.org/fellowship', { now: NOW });
  assert.equal(f.mode.value, 'Online');
  assert.equal(f.deadline.value, '2026-11-30');
  assert.equal(f.openingDate.value, '2026-10-01');
  assert.deepEqual(f.applicationFee.value, { amount: 0, currency: null });
  assert.equal(f.type.value, 'Fellowship');
  assert.match(f.eligibility.value, /United States or Canada/);
});

test('dates, ranges and money in many formats', () => {
  assert.equal(parseDate('Jun. 21, 2026 at 22:00 UTC', { ref: NOW }).iso, '2026-06-21');
  assert.equal(parseDate('15 November 2025', { ref: NOW }).iso, '2025-11-15');
  assert.equal(parseDate('01.12.2026', { ref: NOW }).iso, '2026-12-01');
  assert.equal(parseDate('12/01/2026', { ref: NOW, order: 'mdy' }).iso, '2026-12-01');
  assert.equal(parseDate('2026-12-01', { ref: NOW }).iso, '2026-12-01');
  assert.equal(parseDate('1st of December, 2026', { ref: NOW }).iso, '2026-12-01');
  assert.equal(parseDate('nothing here'), null);
  assert.deepEqual(parseRange('from 15 October 2025 to 1 April 2026', { ref: NOW }), { start: '2025-10-15', end: '2026-04-01' });
  assert.deepEqual(parseMoney('Fee: $25'), { amount: 25, currency: 'USD', raw: '$25' });
  assert.equal(parseMoney('€750.00 program fee').amount, 750);
  assert.equal(parseMoney('1.250 €').amount, 1250);
  assert.equal(parseMoney('40 US Dollar (USD)').currency, 'USD');
  assert.equal(parseMoney('There is no application fee').amount, 0);
  assert.equal(parseMoney('Fees: FREE').amount, 0);
  assert.equal(parseMoney('CA$40').currency, 'CAD');
});

test('label pairs include table rows and label lines', () => {
  const lines = [{ text: 'Deadline | March 3, 2027', kind: 'cell' }, { text: 'Eligibility', kind: 'h' }, { text: 'Open to all.', kind: 'p' }];
  const pairs = labelPairs(lines);
  assert.equal(pairs.find((p) => p.key === 'deadline').value, 'March 3, 2027');
  assert.equal(pairs.find((p) => p.key === 'eligibility').value, 'Open to all.');
});

// ---------------------------------------------------------------- provenance and re-checks

test('re-checks update extracted details, never your own, and record conflicts', () => {
  const url = 'https://example.org/call';
  const ex1 = extractOpportunity(page('resartis'), url, { now: NOW });
  const opp = buildOpportunity({ url, extraction: ex1, origin: { kind: 'url' }, now: '2026-11-01T00:00:00Z' });
  assert.equal(opp.fields.deadline.origin, 'extracted');
  assert.equal(fieldStatus(opp.fields.deadline, { important: true, now: Date.parse('2026-11-02') }).needsVerify, true);
  // You correct the fee and confirm the location.
  setManualField(opp, 'applicationFee', { value: { amount: 15, currency: 'EUR' } }, '2026-11-02T00:00:00Z');
  verifyField(opp, 'location', '2026-11-02T00:00:00Z');
  // The site changes the deadline, the fee and the location.
  const changed = page('resartis').replace('2027-02-01', '2027-02-15').replace('application fee of €20', 'application fee of €25').replace('Burgundy, France', 'Dijon, France');
  const ex2 = extractOpportunity(changed, url, { now: NOW });
  const r = mergeExtraction(opp, ex2, { url, now: '2026-11-10T00:00:00Z' });
  assert.ok(r.changed.includes('deadline'));
  assert.ok(!r.changed.includes('applicationFee') && !r.changed.includes('location'));
  assert.deepEqual(r.conflicts.sort(), ['applicationFee', 'location']);
  assert.equal(opp.fields.deadline.value, '2027-02-15');
  assert.equal(opp.fields.deadline.previous.value, '2027-02-01');
  assert.equal(fieldStatus(opp.fields.deadline).state, 'changed');
  assert.deepEqual(opp.fields.applicationFee.value, { amount: 15, currency: 'EUR' }, 'your value is kept');
  assert.deepEqual(opp.fields.applicationFee.siteValue.value, { amount: 25, currency: 'EUR' });
  assert.equal(fieldStatus(opp.fields.applicationFee).state, 'conflict');
  assert.equal(opp.fields.location.value, 'Burgundy, France');
  acceptSiteValue(opp, 'location');
  assert.equal(opp.fields.location.value, 'Dijon, France');
  assert.equal(fieldStatus(opp.fields.location).state, 'confirmed');
  // Same page again: nothing changes; check dates move forward.
  const r2 = mergeExtraction(opp, ex2, { url, now: '2026-11-11T00:00:00Z' });
  assert.deepEqual([r2.changed, r2.conflicts], [[], ['applicationFee'].filter(() => false)]);
  assert.equal(opp.fields.deadline.checkedAt, '2026-11-11T00:00:00Z');
});

test('details not rechecked for a while are flagged as stale', () => {
  const fv = { value: 'x', origin: 'extracted', confidence: 0.9, verified: true, verifiedAt: '2026-01-01', checkedAt: '2026-01-01', extractedAt: '2026-01-01' };
  assert.equal(fieldStatus(fv, { staleAfterDays: 14, now: Date.parse('2026-03-01'), important: true }).state, 'stale');
  assert.equal(fieldStatus({ ...fv, origin: 'manual' }, { now: Date.parse('2026-03-01') }).state, 'manual');
});

test('verifyCount counts important unconfirmed details', () => {
  const ex = extractOpportunity(page('rivet'), 'https://rivet.es/x', { now: NOW });
  const opp = buildOpportunity({ url: 'https://rivet.es/x', extraction: ex, origin: {}, now: new Date().toISOString() });
  assert.ok(verifyCount(opp) >= 3);
});

// ---------------------------------------------------------------- fit

const PROFILE = {
  name: 'Freeman', basedIn: 'Atlanta, Georgia, United States', countries: ['United States'], disciplines: ['Sound art', 'Music'], mediums: ['guitar'],
  themes: ['listening', 'tuning'], goalTags: ['recording'], careerStage: 'mid-career', birthYear: 1985,
  prefs: { funding: 'prefer-funded', maxApplicationFee: 30, currency: 'USD', formats: ['In person', 'Online', 'Hybrid'], preferRegions: ['Europe'], needs: ['recording studio'], unavailable: [{ from: '2027-03-10', to: '2027-03-20', label: 'Tour' }] },
};

test('fit explains matches and concerns', () => {
  const opp = buildOpportunity({ url: 'u', extraction: extractOpportunity(page('rivet'), 'https://rivet.es/x', { now: NOW }), origin: {} });
  const fit = assessFit(opp, PROFILE, { now: NOW, contactsCount: 1 });
  const labels = fit.reasons.map((r) => `${r.tone}:${r.label}`);
  assert.ok(labels.some((l) => /^good:Includes Sound art/.test(l)), labels.join('\n'));
  assert.ok(labels.some((l) => /^warn:You pay to attend/.test(l)), labels.join('\n'));
  assert.ok(labels.some((l) => /^good:Mentions recording studio/.test(l)), labels.join('\n'));
  assert.ok(labels.some((l) => /^warn:Overlaps a time you are unavailable/.test(l)), labels.join('\n'));
  assert.ok(labels.some((l) => /^good:In Portugal/.test(l)), labels.join('\n'));
  assert.ok(['possible', 'strong', 'weak'].includes(fit.verdict));
});

test('fit flags place-restricted eligibility and passed deadlines as unlikely', () => {
  const opp = buildOpportunity({ url: 'u', extraction: extractOpportunity(page('artconnect'), 'https://artconnect.com/x', { now: NOW }), origin: {} });
  const fit = assessFit(opp, PROFILE, { now: NOW });
  assert.equal(fit.verdict, 'unlikely');
  assert.ok(fit.reasons.some((r) => r.tone === 'bad' && /Appears limited to artists in Berlin or Brandenburg/.test(r.label)), JSON.stringify(fit.reasons));
  const online = buildOpportunity({ url: 'u', extraction: extractOpportunity(page('online'), 'https://x.org/f', { now: NOW }), origin: {} });
  const fit2 = assessFit(online, PROFILE, { now: NOW });
  assert.ok(fit2.reasons.some((r) => r.tone === 'good' && /United States/.test(r.label)), JSON.stringify(fit2.reasons));
  const past = assessFit(online, PROFILE, { now: new Date('2027-01-05') });
  assert.equal(past.verdict, 'unlikely');
});

test('age limits use the birth year only when given', () => {
  const opp = { fields: { eligibility: { value: 'Open to artists under 35.' } } };
  assert.equal(assessFit(opp, { ...PROFILE, birthYear: null }, { now: NOW }).reasons.find((r) => r.criterion === 'eligibility').tone, 'unknown');
  assert.equal(assessFit(opp, PROFILE, { now: NOW }).reasons.find((r) => /age/.test(r.label)).tone, 'bad');
});

test('places and weeks', () => {
  assert.deepEqual(findPlaces('Artists based in Berlin or Brandenburg, Germany').map((p) => p.name), ['Germany']);
  assert.ok(placeMatches('Georgia', 'United States'));
  assert.ok(placeMatches('Portugal', 'Europe'));
  assert.deepEqual(parseWeeks('1 month - 3 months'), { min: 4.345, max: 13.035 });
});

test('tailoring suggestions point at what the call emphasizes', () => {
  const opp = buildOpportunity({ url: 'u', extraction: extractOpportunity(page('resartis'), 'https://resartis.org/x', { now: NOW }), origin: {} });
  const s = tailoringSuggestions({ title: 'P', sections: { summary: 'A new album of microtonal guitar pieces.', description: 'Long description', residencyUse: 'I will write.' } }, opp);
  assert.ok(s.some((x) => x.kind === 'specific'));
  assert.ok(s.some((x) => x.kind === 'facility' && /piano/.test(x.text)), JSON.stringify(s));
  assert.ok(s.some((x) => x.kind === 'timeline'));
});

// ---------------------------------------------------------------- discovery against a local site

test('discovery: patterns, learned patterns, feeds, past deadlines, blocked pages and duplicates', async () => {
  const site = await startFixtureServer();
  const dir = tmp();
  try {
    const db = new Database(dir);
    db.files.sources.data.items = [];
    for (const s of fixtureSources(site.base)) db.create('sources', s);
    const notes = [];
    const d = new Discovery({ db, fetcher: new Fetcher({ perHostDelayMs: 0, timeoutMs: 5000 }), snapshots: new Snapshots(path.join(dir, 'snap')), notify: (t, b) => notes.push(`${t}: ${b}`) });
    const state = await d.run();
    const runs = Object.fromEntries(db.list('sources').map((s) => [s.name, s.lastRun]));
    assert.equal(runs['Res Artis (test)'].found, 4);
    assert.equal(runs['Res Artis (test)'].skippedPast, 1, 'listing shows the 2025 deadline');
    assert.equal(runs['Res Artis (test)'].errors[0].kind, 'blocked');
    assert.equal(runs['Auto-learned (test)'].learnedPattern, '/opp/[^/?#]+/?$');
    assert.equal(runs['Auto-learned (test)'].found, 3);
    const opps = db.list('opportunities');
    const names = opps.map((o) => o.fields.name?.value).sort();
    assert.ok(names.includes('Porte Rouge Open Call May 2027'));
    assert.ok(names.includes('Blocked Call 2027'), 'blocked pages are kept from the listing');
    const blocked = opps.find((o) => o.fields.name?.value === 'Blocked Call 2027');
    assert.equal(blocked.check.status, 'blocked');
    assert.equal(blocked.fields.deadline.value, '2027-04-15');
    assert.equal(blocked.fields.deadline.origin, 'listing');
    // The feed lists items already found by the other sources: no duplicates.
    const keys = opps.map((o) => o.url);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(opps.filter((o) => /Sound Field/i.test(o.fields.name?.value || '')).length, 1);
    assert.ok(state.finishedAt);
    assert.equal(notes.length, 1);

    // Re-check after the page changes.
    const porte = opps.find((o) => o.fields.name?.value === 'Porte Rouge Open Call May 2027');
    db.update('opportunities', porte.id, { status: 'saved' });
    site.state.porteDeadline = '2027-02-20';
    const r = await d.recheck(porte.id);
    assert.deepEqual(r.changed, ['deadline']);
    assert.equal(r.pageChanged, true);
    assert.equal(db.get('opportunities', porte.id).check.status, 'changed');
    assert.equal(notes.length, 2, 'a change to a saved opportunity notifies you');

    // A second run finds nothing new and doesn't re-download known pages.
    const before = site.state.hits['/opp/sound-field-residency-2027'];
    await d.run();
    assert.equal(site.state.hits['/opp/sound-field-residency-2027'], before);
    assert.equal(db.list('opportunities').length, opps.length);

    // Pasting a link that 404s still creates an entry to fill in by hand.
    const gone = await d.importUrl(`${site.base}/gone`);
    assert.equal(gone.error.kind, 'not-found');
    assert.equal(db.get('opportunities', gone.opportunity.id).check.status, 'not-found');

    // Test Source shows links and a sample.
    const t = await d.testSource(db.list('sources')[1]);
    assert.equal(t.count, 3);
    assert.ok(t.sample.fields.deadline);
    db.flushAll();
  } finally {
    await site.close();
  }
});

test('learnPattern ignores navigation and category links', () => {
  const html = '<a href="/about">About</a><a href="/tag/x">x</a><a href="/calls/view/a-long-slug-1">Call one title here</a><a href="/calls/view/b-slug-2">Call two title here</a><a href="/calls/view/c-slug-3">Call three title here</a>';
  const links = getLinks(parseHtml(html), 'https://rivet.es/calls');
  assert.equal(learnPattern(links, 'https://rivet.es/calls').pattern, '/calls/view/[^/?#]+/?$');
});

test('feeds', () => {
  const items = parseFeed('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A call</title><link href="https://x.org/a"/><summary>Deadline March 1, 2027</summary></entry></feed>');
  assert.deepEqual(items.map((i) => [i.title, i.url]), [['A call', 'https://x.org/a']]);
});

test('similar names across sources', () => {
  assert.ok(similarNames('Sound Field Residency 2027', 'SOUND FIELD — Residency 2027 Open Call'));
  assert.ok(!similarNames('Sound Field Residency', 'Porte Rouge Residency'));
});

// ---------------------------------------------------------------- calendar

test('calendar items and .ics export', () => {
  const opps = [
    { id: 'o1', status: 'saved', fields: { name: { value: 'Porte Rouge, with a comma; and semicolon' }, deadline: { value: '2027-02-01' }, programDates: { value: { start: '2027-05-03', end: '2027-05-31' } } } },
    { id: 'o2', status: 'new', fields: { name: { value: 'Hidden' }, deadline: { value: '2027-03-01' } } },
    { id: 'o3', status: 'saved', calendar: false, fields: { name: { value: 'Switched off' }, deadline: { value: '2027-03-02' } } },
  ];
  const apps = [{ id: 'a1', opportunityId: 'o1', status: 'preparing', targetDate: '2027-01-20', recommendations: [{ id: 'r1', contactId: 'c1', status: 'asked', dueDate: '2027-01-25' }] }];
  const items = calendarItems({ opportunities: opps, applications: apps, contacts: [{ id: 'c1', name: 'Ada' }] });
  assert.deepEqual(items.map((i) => i.kind), ['target', 'rec', 'deadline', 'program']);
  const ics = buildIcs(items, { now: new Date('2026-11-18T00:00:00Z') });
  assert.match(ics, /DTSTART;VALUE=DATE:20270201/);
  assert.match(ics, /DTEND;VALUE=DATE:20270601/, 'multi-day events end the day after');
  assert.match(ics, /SUMMARY:Deadline: Porte Rouge\\, with a comma\\; and semicolon/);
  assert.match(ics, /TRIGGER:-P6DT15H/);
  assert.match(ics, /UID:atelier-o1-deadline@atelier\.local/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
});

// ---------------------------------------------------------------- review, backups

test('review checklist and confirmation hash', () => {
  const dir = tmp();
  const db = new Database(dir);
  const ex = extractOpportunity(page('resartis'), 'https://resartis.org/x', { now: NOW });
  const opp = db.create('opportunities', buildOpportunity({ url: 'https://resartis.org/x', extraction: ex, origin: {}, status: 'saved' }));
  const item = db.create('portfolio', { title: 'Lattice', files: [], links: [] });
  const app = db.create('applications', {
    opportunityId: opp.id, status: 'preparing', materials: [{ id: 'm1', type: 'cv', label: 'CV', required: true, status: 'done' }, { id: 'm2', type: 'statement', label: 'Statement', required: true, status: 'todo' }],
    answers: [{ id: 'q1', question: 'Describe your project', text: 'word '.repeat(60), limit: { words: 50 } }], samples: [{ itemId: item.id }], recommendations: [],
  });
  const r = buildReview(db, app.id, { staleAfterDays: 14 });
  const byKey = Object.fromEntries(r.checklist.map((c) => [c.key, c]));
  assert.equal(byKey['mat:m2'].status, 'missing');
  assert.equal(byKey['ans:q1'].status, 'warn');
  assert.equal(byKey.samples.status, 'warn', 'call asks for 10 images');
  assert.equal(byKey.recs.status, 'warn');
  assert.equal(byKey.verify.status, 'warn');
  const h1 = reviewHash(db.get('applications', app.id), null);
  db.update('applications', app.id, (a) => { a.answers[0].text = 'Shorter.'; });
  assert.notEqual(reviewHash(db.get('applications', app.id), null), h1);
  assert.deepEqual(sampleLimit('Send 10 images of recent work or up to 3 links'), { min: 10, max: 10 });
  assert.deepEqual(sampleLimit('up to 8 images'), { min: 1, max: 8 });
});

test('backup, restore and readable export', async () => {
  const dir = tmp();
  const db = new Database(dir);
  db.updateProfile({ name: 'Freeman Edwards', disciplines: ['Music'] });
  const o = db.create('opportunities', buildOpportunity({ url: 'https://x.org', extraction: extractOpportunity(page('rivet'), 'https://x.org', { now: NOW }), origin: {}, status: 'saved' }));
  db.create('proposals', { title: 'Listening Lattice', sections: { summary: 'A piece.' } });
  fs.mkdirSync(path.join(dir, 'Portfolio', 'pf1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Portfolio', 'pf1', 'f.txt'), 'hello');
  const b = new Backups({ db, dataDir: dir, portfolioDir: path.join(dir, 'Portfolio'), snapshotsDir: path.join(dir, 'Snapshots'), appVersion: '1.0.0' });
  const made = await b.create({ includeFiles: true });
  assert.ok(fs.existsSync(made.file));
  assert.equal((await b.inspect(made.file)).counts.opportunities, 1);
  // Change things, then restore.
  db.remove('opportunities', o.id);
  db.updateProfile({ name: 'Someone else' });
  fs.rmSync(path.join(dir, 'Portfolio', 'pf1', 'f.txt'));
  const r = await b.restore(made.file);
  assert.ok(fs.existsSync(r.safetyBackup));
  assert.equal(db.list('opportunities').length, 1);
  assert.equal(db.profile.name, 'Freeman Edwards');
  assert.equal(fs.readFileSync(path.join(dir, 'Portfolio', 'pf1', 'f.txt'), 'utf8'), 'hello');
  const ex = await b.exportReadable(tmp());
  const csv = fs.readFileSync(path.join(ex.dir, 'opportunities.csv'), 'utf8');
  assert.match(csv, /Sound Field Residency 2027/);
  assert.ok(fs.existsSync(path.join(ex.dir, 'Proposals', 'Listening Lattice.md')));
  await assert.rejects(b.inspect(path.join(ex.dir, 'opportunities.csv')));
});

test('database recovers from a corrupt file using the previous copy', () => {
  const dir = tmp();
  const db = new Database(dir);
  db.create('contacts', { name: 'Ada' });
  db.flushAll();
  db.create('contacts', { name: 'Grace' });
  db.flushAll();
  fs.writeFileSync(path.join(dir, 'contacts.json'), '{ broken');
  const db2 = new Database(dir);
  assert.deepEqual(db2.list('contacts').map((c) => c.name), ['Ada']);
  assert.deepEqual(db2.recovered, ['contacts.json']);
});

test('loose JSON from AI replies', () => {
  assert.deepEqual(parseJsonLoose('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('prefix [1,2] suffix'), [1, 2]);
  assert.equal(parseJsonLoose('nothing'), null);
});

test('the window only calls channels the app process handles', () => {
  const main = fs.readFileSync(path.join(here, '../src/main/main.mjs'), 'utf8');
  const preload = fs.readFileSync(path.join(here, '../src/preload/preload.cjs'), 'utf8');
  const handled = new Set([...main.matchAll(/handle\('([a-zA-Z:]+)'/g)].map((m) => m[1]));
  const allowed = new Set([...preload.matchAll(/'([a-z]+:[a-zA-Z]+)'/g)].map((m) => m[1]));
  const used = new Set();
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'dist') walk(p); } else if (/\.jsx?$/.test(f)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/(?:call|invoke)\(\s*'([a-z]+:[a-zA-Z]+)'/g)) used.add(m[1]); } };
  walk(path.join(here, '../src/renderer'));
  for (const c of used) {
    assert.ok(handled.has(c), `${c} is not handled`);
    assert.ok(allowed.has(c), `${c} is not allowed by the preload`);
  }
  assert.ok(used.size > 40);
});

test('deadline helper', () => {
  assert.deepEqual(deadlineOf({ fields: { deadline: { value: 'rolling' } } }), { kind: 'rolling' });
  assert.equal(deadlineOf({ fields: {} }).kind, 'unknown');
});
