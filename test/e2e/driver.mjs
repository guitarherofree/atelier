// End-to-end walkthrough used during development: drives the real app against local stand-in
// websites, checks behaviour through the interface, and saves screenshots. Loaded only when ATELIER_E2E=1.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { dialog, shell, nativeTheme } from 'electron';
import { startFixtureServer, fixtureSources } from '../fixture-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = path.resolve(process.env.ATELIER_SCREENSHOT_DIR || 'test/.tmp/shots');
const media = process.env.ATELIER_E2E_MEDIA;
const exportDir = process.env.ATELIER_E2E_OUT;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- stand-ins for GitHub and an AI server
function startMocks(port) {
  const TOKEN = 'github_pat_test';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/repos/guitarherofree/atelier/releases/latest') {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"message":"Not Found"}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({
          tag_name: 'v9.9.0', name: 'Atelier 9.9.0', published_at: '2026-12-01T15:00:00Z', html_url: 'https://github.com/guitarherofree/atelier/releases/tag/v9.9.0',
          body: '- Faster source checks\n- Map clusters nearby residencies', assets: [{ id: 1, name: 'Atelier-9.9.0-mac-arm64.zip', size: 10, url: `http://127.0.0.1:${port}/asset/1` }, { id: 2, name: 'Atelier-9.9.0-mac-x64.zip', size: 10, url: `http://127.0.0.1:${port}/asset/2` }],
        }));
      }
      if (req.url === '/v1/chat/completions') {
        const prompt = JSON.parse(body).messages.map((m) => m.content).join('\n');
        let content = 'ready';
        if (/"sections": \{<section key>/.test(prompt)) {
          content = JSON.stringify({ sections: { residencyUse: 'At Porte Rouge I would spend the first week recording the farmhouse’s rooms, then use the piano and recording booth to compose four pieces for retuned guitar and piano. [ADD: which rooms]' }, notes: [{ section: 'residencyUse', change: 'Named the piano and recording booth', reason: 'The call lists both' }] });
        } else if (/Return JSON: \{"fields"/.test(prompt)) {
          content = JSON.stringify({ fields: { language: { value: 'English, French', quote: 'English' } } });
        } else if (/QUESTION/.test(prompt)) content = 'I make music for retuned electric guitar. [ADD: one recent project]';
        else if (/ARTIST PROFILE/.test(prompt)) content = 'Likely a good fit.\nWhy it fits\n- Sound art is welcome\nConcerns or unknowns\n- Travel cost';
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }
      res.writeHead(404);
      res.end();
    });
  });
  server.listen(port, '127.0.0.1');
  return { server, TOKEN };
}

export async function run({ app, win, db, discovery, updater, browser, backups, pf, actions }) {
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(exportDir, { recursive: true });
  const site = await startFixtureServer();
  const mocks = startMocks(47131);
  process.env.ATELIER_GEOCODE_ENDPOINT = `${site.base}/geocode`;

  // Dialogs answer themselves; links and files are recorded instead of opened.
  const opened = [];
  dialog.showMessageBox = async () => ({ response: 0 });
  dialog.showOpenDialog = async (_w, o) => ({ canceled: false, filePaths: o?.properties?.includes('openDirectory') ? [exportDir] : [path.join(media, 'CV 2026.pdf')] });
  dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(exportDir, path.basename(o?.defaultPath || 'file')) });
  shell.openExternal = async (u) => { opened.push(u); };
  shell.openPath = async (p) => { opened.push(p); return ''; };
  shell.showItemInFolder = (p) => { opened.push(p); };

  const w = win();
  const errors = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    const level = e.level ?? lvl;
    if (level === 'error' || level === 3) errors.push(e.message ?? msg);
  });
  if (w.webContents.isLoading()) await new Promise((r) => w.webContents.once('did-finish-load', r));
  await sleep(1200);
  const js = (code) => w.webContents.executeJavaScript(code, true);
  const shot = async (name) => {
    await sleep(450);
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
  };
  const waitFor = async (code, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await js(code).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };
  const go = (view, params = {}) => js(`window.__go(${JSON.stringify(view)}, ${JSON.stringify(params)})`);
  const click = (sel, text) => js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'}); if (!el) return false; el.click(); return true; })()`);
  const text = () => js('document.querySelector(".main").innerText');
  const setInput = (sel, value, index = 0) => js(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${index}]; if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return true; })()`);
  const oppByName = (n) => db.list('opportunities').find((o) => (o.fields?.name?.value || '').toLowerCase().includes(n.toLowerCase()));

  try {
    w.setSize(1440, 920);
    check('opens on Discover with an empty inbox', await waitFor(`document.querySelector('.empty h3')?.textContent.includes('Nothing new')`));
    check('built-in sources are seeded', db.list('sources').length === 9, db.list('sources').map((s) => s.name).join(', '));
    await shot('01-discover-empty');

    // ---- profile and library
    db.updateProfile({
      name: 'Freeman Edwards', website: 'https://example.com', basedIn: 'Atlanta, Georgia, United States', countries: ['United States', 'Georgia'],
      careerStage: 'mid-career', disciplines: ['Sound art', 'Music', 'Composition'], mediums: ['electric guitar', 'field recording'], themes: ['listening', 'tuning', 'place'],
      goals: 'Time and a quiet room to compose and record a new set of microtonal guitar pieces.', goalTags: ['recording', 'composition'],
      prefs: { funding: 'prefer-funded', maxApplicationFee: 30, currency: 'USD', preferRegions: ['Europe'], needs: ['recording studio', 'piano'], unavailable: [{ from: '2027-03-10', to: '2027-03-20', label: 'Tour' }] },
    });
    db.create('contacts', { name: 'Dr. Ada Lin', email: 'ada@example.edu', role: 'Former professor', notes: '' });
    db.create('contacts', { name: 'Marcus Webb', email: 'marcus@example.org', role: 'Curator', notes: '' });
    const imgs = fs.readdirSync(media).filter((f) => /\.(png|mp3)$/.test(f)).map((f) => path.join(media, f));
    await js('window.atelier.invoke("portfolio:addPaths", null, ' + JSON.stringify(imgs) + ')');
    const proj = db.create('projects', { title: 'Retuned Guitar', years: '2024–2026', description: 'Pieces for electric guitar in just intonation.' });
    for (const it of db.list('portfolio')) db.update('portfolio', it.id, { projectId: proj.id, year: '2025', medium: 'Electric guitar, tape', caption: `${it.title}, 2025. Electric guitar in 7-limit just intonation.` });
    db.create('proposals', { title: 'Listening Lattice', tags: ['guitar'], versions: [], sections: {
      summary: 'A cycle of pieces for retuned electric guitar that maps the harmonic series of a place.',
      description: 'Listening Lattice continues my work with just intonation on electric guitar. Each piece starts from field recordings of a room or landscape and derives a tuning from its resonances.',
      residencyUse: 'I will record the spaces around the residency, analyse their resonances, and compose and record new pieces.',
      specialRequirements: 'A quiet room and stable power for amplification.',
    } });
    db.create('snippets', { title: 'Short bio (50 words)', kind: 'bio', text: 'Freeman Edwards is an Atlanta-based guitarist and composer working with just intonation, field recording and retuned electric guitar.', tags: [] });
    check('portfolio items imported with copies', db.list('portfolio').length === 5 && db.list('portfolio').every((p) => p.files.length === 1 && fs.existsSync(pf.pathOf(p.files[0]))));

    // ---- discovery against stand-in sites
    db.files.sources.data.items = [];
    for (const s of fixtureSources(site.base)) db.create('sources', s);
    db.create('sources', { ...fixtureSources(site.base)[0], name: 'Instagram #artistresidency', kind: 'instagram', enabled: false, listingUrls: [], homepage: 'https://www.instagram.com/explore/tags/artistresidency/', notes: 'Optional.' });
    await go('discover');
    await sleep(300);
    await click('.page-actions .btn-primary', 'Find new');
    check('discovery finishes', await waitFor('!document.querySelector(".find-btn.running")', 30000));
    await sleep(500);
    const n = db.list('opportunities').length;
    check('discovery found opportunities from three kinds of source', n >= 6, `${n} opportunities`);
    check('cards appear in Discover', await waitFor('document.querySelectorAll(".opp-card").length >= 5'));
    await click('.run-status-head');
    await shot('02-discover-results');

    // ---- the time and space filter
    const pick = (label, value) => js(`(() => { const el = [...document.querySelectorAll('.filters select')].find((s) => [...s.options].some((o) => o.textContent === ${JSON.stringify(label)})); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    const cardNames = () => js('[...document.querySelectorAll(".opp-card h3")].map((h) => h.textContent)');
    const byUrl = (part) => db.list('opportunities').find((o) => (o.url || '').includes(part));
    const tsOpp = byUrl('between-bridges');
    const dutyOpp = byUrl('hillside-studios');
    const nameOf = (o) => (o?.fields?.name?.value || '').toLowerCase();
    const has = (names, o) => names.some((n) => n.toLowerCase() === nameOf(o));
    check('residency focus read from the page wording', tsOpp?.fields?.focus?.value === 'Time and space' && dutyOpp?.fields?.focus?.value === 'Public engagement', `${tsOpp?.fields?.focus?.value} / ${dutyOpp?.fields?.focus?.value}`);
    check('cards show a Time & space badge', await waitFor('[...document.querySelectorAll(".opp-card")].some((c) => c.querySelector(".badge.tone-space")?.textContent.includes("Time & space"))'));
    await pick('Time & space', 'timespace');
    await sleep(300);
    const onlyTs = await cardNames();
    check('Time & space filter shows only time-and-space residencies', onlyTs.length === 1 && has(onlyTs, tsOpp), onlyTs.join(' | '));
    await shot('02b-time-and-space-filter');
    await pick('Time & space', 'timespace-open');
    await sleep(300);
    const open = await cardNames();
    check('“or not stated” adds residencies with no focus yet, not ones with duties', has(open, tsOpp) && !has(open, dutyOpp) && open.length > 1, open.join(' | '));
    await pick('Time & space', 'duties');
    await sleep(300);
    const duties = await cardNames();
    check('“Project or duties required” shows the others', has(duties, dutyOpp) && !has(duties, tsOpp), duties.join(' | '));
    await pick('Time & space', '');
    await sleep(300);

    // ---- an opportunity in detail
    const porte = oppByName('Porte Rouge');
    await go('opportunity', { id: porte.id });
    check('detail shows fields with provenance', await waitFor('document.querySelectorAll(".field-row").length > 20 && !!document.querySelector(".prov")'));
    await shot('03-opportunity-details');
    await js(`[...document.querySelectorAll('.field-row')].find((r) => r.querySelector('.field-label').textContent === 'Deadline').querySelector('.prov-btn').click()`);
    check('provenance detail shows the source text', await waitFor('document.querySelector(".field-detail blockquote")?.textContent.includes("2027-02-01")'));
    await shot('04-provenance');
    await click('.tab', 'Fit');
    check('fit tab explains', await waitFor('document.querySelector(".fit-panel")?.innerText.includes("Why it may fit")'));
    await shot('05-fit');

    // Save it, correct the fee by hand, then the site changes.
    await js(`window.atelier.invoke('opp:setStatus', ${JSON.stringify(porte.id)}, 'saved')`);
    await js(`window.atelier.invoke('opp:setField', ${JSON.stringify(porte.id)}, 'applicationFee', { value: { amount: 15, currency: 'EUR' } })`);
    site.state.porteDeadline = '2027-02-15';
    site.state.porteFee = '€25';
    await click('.tab', 'Details');
    await sleep(200);
    await click('.banner .btn', 'Re-check now');
    check('re-check flags the change', await waitFor('document.querySelector(".banner.tone-warn")?.innerText.includes("changed")', 15000));
    const after = db.get('opportunities', porte.id);
    check('your value is kept and the site’s value recorded', after.fields.applicationFee.value.amount === 15 && after.fields.applicationFee.siteValue?.value?.amount === 25);
    check('the extracted deadline updates with the old one kept', after.fields.deadline.value === '2027-02-15' && after.fields.deadline.previous?.value === '2027-02-01');
    await shot('06-changed-on-site');
    await click('.tab', 'Page history');
    check('page history shows a diff', await waitFor('!!document.querySelector(".page-text ins")'));
    await shot('07-page-history');

    const blocked = oppByName('Blocked Call');
    await go('opportunity', { id: blocked.id });
    check('blocked page explains what happened', await waitFor('document.querySelector(".banner.tone-warn")?.innerText.includes("refused automated access")'));
    await shot('08-blocked-source');

    // ---- AI (stand-in server)
    db.updateSettings({ ai: { provider: 'openai', openai: { baseUrl: 'http://127.0.0.1:47131/v1', model: 'test' } } });
    await sleep(200);
    const fitR = await js(`window.atelier.invoke('opp:aiFit', ${JSON.stringify(porte.id)})`);
    check('AI fit explanation (after consent)', /good fit/.test(fitR?.text || ''), JSON.stringify(fitR).slice(0, 120));
    const exR = await js(`window.atelier.invoke('opp:aiExtract', ${JSON.stringify(porte.id)})`);
    check('AI extraction fills missing details as “Extracted by AI”', exR?.updated?.includes('language') && db.get('opportunities', porte.id).fields.language.origin === 'ai', JSON.stringify(exR));

    // ---- application
    await go('opportunity', { id: porte.id });
    await sleep(200);
    await click('.detail-actions .btn-primary', 'Start application');
    check('application created from requirements', await waitFor('document.querySelector(".eyebrow")?.textContent === "Application"'));
    const app1 = db.list('applications')[0];
    check('materials come from the call', app1.materials.some((m) => m.type === 'cv') && app1.materials.some((m) => m.type === 'letters') && app1.materials.some((m) => m.type === 'samples'), app1.materials.map((m) => m.type).join(','));
    await shot('09-application-overview');
    await click('.tab', 'Materials');
    await sleep(300);
    const cv = app1.materials.find((m) => m.type === 'cv');
    await js(`window.atelier.invoke('app:attachFile', ${JSON.stringify(app1.id)}, ${JSON.stringify(cv.id)})`);
    await sleep(300);
    check('attaching a file marks it done', db.get('applications', app1.id).materials.find((m) => m.id === cv.id).status === 'done');
    await shot('10-materials');

    await click('.tab', 'Proposal');
    await sleep(300);
    await click('.proposal-pick .btn', 'Tailored copy with AI suggestions');
    check('tailored copy created and attached', await waitFor(`!!${JSON.stringify(db.get('applications', app1.id)?.id)} && document.querySelector('.proposal-tab .banner')?.innerText.includes('Tailored copy')`, 15000));
    const tailored = db.list('proposals').find((p) => p.tailoredFrom);
    const original = db.list('proposals').find((p) => !p.tailoredFrom);
    check('original proposal unchanged', !!tailored && original.sections.residencyUse.startsWith('I will record') && tailored.sections.residencyUse.startsWith('At Porte Rouge'));
    await click('.proposal-tab .toggle-text', 'Show changes');
    await sleep(300);
    await shot('11-proposal-tailored');
    await click('.proposal-tab .toggle-text', 'Show changes');

    await click('.tab', 'Answers');
    await sleep(200);
    await js(`window.atelier.invoke('app:update', ${JSON.stringify(app1.id)}, { answers: [{ id: 'q1', question: 'Describe your practice (150 words)', limit: { words: 150 }, text: '' }, { id: 'q2', question: 'Why this residency? (500 characters)', limit: { chars: 500 }, text: '' }] })`);
    await sleep(300);
    await click('.answer .btn', 'Draft with AI');
    check('AI drafts an answer with placeholders', await waitFor('document.querySelector(".answer textarea")?.value.includes("[ADD:")', 10000));
    await setInput('.answer textarea', 'At Porte Rouge I would record the farmhouse and compose. '.repeat(3), 1);
    await sleep(1000);
    await shot('12-answers');

    await click('.tab', 'Samples');
    await sleep(300);
    await click('.pick');
    await sleep(200);
    await js(`document.querySelectorAll('.pick')[2].click()`);
    await sleep(300);
    check('samples selected in order', (db.get('applications', app1.id).samples || []).length === 2);
    await shot('13-samples');

    await click('.tab', 'Letters');
    await sleep(200);
    await click('.letters > .btn', 'Add a recommender');
    await sleep(300);
    await click('.rec .btn', 'Draft request');
    await sleep(300);
    check('request draft uses the call details', await waitFor('document.querySelector(".rec-draft textarea")?.value.includes("Porte Rouge")'));
    await shot('14-letters');
    await click('.rec-draft .btn-primary', 'Review and open in Mail');
    await sleep(500);
    check('Mail opens only after confirmation, then status is Asked', opened.some((u) => u.startsWith('mailto:ada%40example.edu')) && db.get('applications', app1.id).recommendations[0].status === 'asked');

    await click('.tab', 'Review');
    check('review lists a checklist', await waitFor('document.querySelectorAll(".checklist li").length > 5'));
    const portalBefore = await js(`window.atelier.invoke('app:openPortal', ${JSON.stringify(app1.id)})`);
    check('the form won’t open before you confirm', portalBefore?.needsConfirmation === true);
    await shot('15-review');
    await js(`document.querySelector('.confirm-box input[type=checkbox]').click()`);
    await sleep(100);
    await click('.confirm-box .btn-primary', 'Confirm review');
    check('review confirmed', await waitFor('document.querySelector(".review-status")?.innerText.includes("You confirmed")'));
    await shot('16-confirmed');
    await click('.confirm-box .btn', 'Export package');
    await sleep(2500);
    const pkgDir = fs.readdirSync(exportDir).find((d) => /application/.test(d));
    const pkgFiles = pkgDir ? fs.readdirSync(path.join(exportDir, pkgDir)) : [];
    check('package has a PDF summary, answers, proposal and numbered samples', pkgFiles.includes('Application summary.pdf') && pkgFiles.includes('Answers.txt') && pkgFiles.includes('Proposal.txt') && fs.readdirSync(path.join(exportDir, pkgDir, 'Work samples')).some((f) => f.startsWith('01 ')), pkgFiles.join(', '));
    await click('.confirm-box .btn-primary', 'Open application form');
    await sleep(400);
    check('application form opens after confirmation', opened.includes('https://porterouge.example.org') || opened.some((u) => /porterouge|forms\.example/.test(u)), opened.slice(-2).join(' | '));
    // Changing the application invalidates the confirmation.
    await js(`window.atelier.invoke('app:update', ${JSON.stringify(app1.id)}, { answers: ${JSON.stringify([{ id: 'q1', question: 'Describe your practice (150 words)', limit: { words: 150 }, text: 'Changed after confirming.' }])} })`);
    check('changes after confirming require a new review', await waitFor('document.querySelector(".review-status")?.innerText.includes("Changed since you confirmed")'));

    await js(`window.atelier.invoke('app:create', ${JSON.stringify(oppByName('Sound Field').id)})`);
    await js(`window.atelier.invoke('app:create', ${JSON.stringify(oppByName('Remote Studio').id)})`);
    await go('applications');
    check('board shows applications', await waitFor('document.querySelectorAll(".app-card").length === 3'));
    await shot('17-applications-board');

    // ---- calendar
    await js(`window.atelier.invoke('app:update', ${JSON.stringify(app1.id)}, { targetDate: '2027-02-05', recommendations: [{ ...${JSON.stringify(db.get('applications', app1.id).recommendations[0])}, dueDate: '2027-02-10' }] })`);
    await go('calendar');
    await sleep(300);
    // Jump to February 2027.
    for (let i = 0; i < 3; i += 1) { await js(`document.querySelectorAll('.cal-head .btn')[1].click()`); await sleep(120); }
    check('calendar shows deadlines, targets and letters', await waitFor('document.querySelectorAll(".cal-item.kind-deadline").length >= 1 && document.querySelectorAll(".cal-item.kind-target").length >= 1 && document.querySelectorAll(".cal-item.kind-rec").length >= 1'));
    await shot('18-calendar');
    await click('.page-actions .btn-primary', 'Export to Apple Calendar');
    await sleep(300);
    await shot('19-calendar-export');
    await click('.modal-foot .btn-primary', 'Add to Apple Calendar');
    await sleep(600);
    const ics = fs.readdirSync(path.join(app.getPath('userData'), 'Exports')).find((f) => f.endsWith('.ics'));
    check('calendar file written for Apple Calendar', !!ics && /BEGIN:VEVENT/.test(fs.readFileSync(path.join(app.getPath('userData'), 'Exports', ics), 'utf8')));

    // ---- map
    db.update('opportunities', oppByName('Remote Studio').id, (o) => { o.status = 'saved'; });
    await go('map');
    await sleep(500);
    await click('.map-side .btn', 'Look up locations');
    check('locations placed on the map', await waitFor('document.querySelectorAll(".leaflet-marker-icon").length >= 2', 15000));
    check('online opportunities listed separately', (await js('document.querySelector(".map-side").innerText')).includes('Remote Studio Fellowship'));
    await shot('20-map');

    // ---- portfolio, writing, profile, sources, settings
    await go('portfolio');
    await sleep(500);
    await click('.pf-card');
    await sleep(300);
    await shot('21-portfolio');
    await go('writing', {});
    await sleep(400);
    await shot('22-proposals');
    await click('.btn', 'New proposal (guided)');
    await sleep(300);
    await click('.gs', 'Planned use of residency time');
    await sleep(200);
    await shot('23-guided-proposal');
    await js('document.querySelector(".modal-head .icon-btn").click()');
    await go('profile');
    await sleep(400);
    await shot('24-profile');
    await go('sources');
    await sleep(400);
    await shot('25-sources');
    await js(`document.querySelectorAll('.source .icon-btn[aria-label="Edit and test"]')[1].click()`);
    await sleep(200);
    await click('.modal-foot .btn', 'Test');
    check('source test lists links and a sample', await waitFor('document.querySelector(".test-results")?.innerText.includes("found 3")', 15000));
    await shot('26-source-test');
    await js('document.querySelector(".modal-head .icon-btn").click()');

    await go('settings', { section: 'ai' });
    await sleep(400);
    await shot('27-settings-ai');
    // Updates: token, check, available.
    await updater.setToken(mocks.TOKEN);
    check('update check finds the new release', updater.status.state === 'available' && updater.status.latest.version === '9.9.0', JSON.stringify(updater.status).slice(0, 160));
    await go('settings', { section: 'updates' });
    await sleep(500);
    await shot('28-settings-updates');
    await go('settings', { section: 'backups' });
    await sleep(300);
    const b = await backups.create({});
    check('backup created', fs.existsSync(b.file));
    const before = db.list('opportunities').length;
    db.remove('opportunities', oppByName('Between Bridges').id);
    const restored = await backups.restore(b.file);
    check('restore brings data back and keeps a safety copy', db.list('opportunities').length === before && fs.existsSync(restored.safetyBackup));
    await go('settings', { section: 'privacy' });
    await sleep(200);
    await go('settings', { section: 'backups' });
    await sleep(600);
    await shot('29-settings-backups');

    // ---- add from URL with an unreadable page, and the Atelier browser capture
    await go('discover');
    await sleep(200);
    await click('.page-actions .btn', 'Add from URL');
    await sleep(200);
    await setInput('.modal textarea', `${site.base}/gone`);
    await click('.modal-foot .btn-primary', 'Add');
    check('a page that is gone is still added for you to fill in', await waitFor('document.querySelector(".import-results")?.innerText.includes("added, but")', 10000));
    await shot('30-add-url-error');
    await js('document.querySelector(".modal-head .icon-btn").click()');
    browser.open(`${site.base}/opp/between-bridges-residency-2027`);
    await sleep(1500);
    const cap = await browser.capture();
    check('capture from the Atelier browser updates the existing opportunity', cap?.updated === true, JSON.stringify(cap));
    browser.close();

    await click('.page-actions .btn', 'Search the web');
    await sleep(500);
    await shot('31-search');
    await js('document.querySelector(".modal-head .icon-btn").click()');

    nativeTheme.themeSource = 'dark';
    await go('opportunity', { id: porte.id });
    await sleep(500);
    await shot('32-dark-details');
    await go('discover');
    await sleep(300);
    await shot('33-dark-discover');
    nativeTheme.themeSource = 'system';

    check('no errors in the window console', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('walkthrough completed', false, err.stack);
  } finally {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    await site.close();
    mocks.server.close();
    setTimeout(() => app.exit(failed.length ? 1 : 0), 300);
  }
}
