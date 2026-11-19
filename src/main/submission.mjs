// The review step before anything leaves Atelier: a complete picture of an application, a checklist of
// what's missing, a confirmation that becomes invalid if anything changes afterwards, and an export
// of the whole package. Atelier never submits to a website on its own.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  oppName, fieldText, deadlineOf, fieldStatus, FIELD_BY_KEY, MATERIAL_TYPES, REC_STATUSES, wordCount, charCount, PROPOSAL_SECTIONS,
  requiredCount, sampleLimit, materialStatus,
} from '../shared/schema.mjs';

export { requiredCount, sampleLimit };

export function reviewHash(app, proposal) {
  const data = {
    answers: (app.answers || []).map((a) => [a.question, a.text]),
    proposal: proposal ? [proposal.id, proposal.updatedAt, proposal.sections] : null,
    samples: (app.samples || []).filter((s) => s.include !== false).map((s) => [s.itemId, s.caption || '']),
    materials: (app.materials || []).map((m) => [m.id, m.status, m.file?.id || null, m.text || '', m.snippetId || null]),
    recs: (app.recommendations || []).map((r) => [r.contactId, r.status]),
  };
  return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

export function buildReview(db, appId, { staleAfterDays = 14 } = {}) {
  const app = db.get('applications', appId);
  if (!app) return null;
  const opp = db.get('opportunities', app.opportunityId);
  const proposal = app.proposalId ? db.get('proposals', app.proposalId) : null;
  const checklist = [];
  const add = (status, label, detail = '', key = label) => checklist.push({ status, label, detail, key });
  const f = opp?.fields || {};

  // Deadline and key facts
  const dl = deadlineOf(opp || {});
  const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });
  if (dl.kind === 'date') {
    if (dl.days < 0) add('missing', 'Deadline has passed', longDate(dl.date), 'deadline');
    else add(dl.days <= 3 ? 'warn' : 'ok', `${dl.days} day${dl.days === 1 ? '' : 's'} until the deadline`, `${longDate(dl.date)}${f.deadline?.text && !/^\d{4}-\d{2}-\d{2}$/.test(f.deadline.text) ? ` (“${f.deadline.text}”)` : ''}`, 'deadline');
  } else if (dl.kind === 'rolling') add('ok', 'Rolling deadline', '', 'deadline');
  else add('warn', 'No deadline recorded', 'Add it on the opportunity page so the calendar can remind you.', 'deadline');

  const verify = [];
  for (const key of ['deadline', 'eligibility', 'applicationFee', 'requirements', 'workSamples', 'recommendations', 'applyUrl']) {
    const st = fieldStatus(f[key], { staleAfterDays, important: true });
    if (st.needsVerify) verify.push({ key, label: FIELD_BY_KEY[key]?.label || key, state: st.label });
  }
  if (verify.length) add('warn', 'Details to verify on the official page', verify.map((v) => `${v.label} (${v.state.toLowerCase()})`).join(', '), 'verify');
  const changedKeys = [...(opp?.check?.changedFields || []), ...(opp?.check?.conflicts || [])].filter((k) => k !== 'description');
  if (opp?.check?.status === 'changed' && changedKeys.length) add('warn', 'The page changed at the last check', changedKeys.map((k) => FIELD_BY_KEY[k]?.label || k).join(', '), 'changed');

  // Materials
  const covered = new Set();
  for (const m of app.materials || []) {
    if (m.required === false) continue;
    const label = m.label || MATERIAL_TYPES.find((t) => t.key === m.type)?.label || 'Material';
    const st = materialStatus(m, app, opp, proposal);
    if (st.derived) covered.add(m.type);
    if (st.status === 'done') add('ok', label, st.note || m.file?.name || (m.snippetId ? 'Saved text' : ''), `mat:${m.id}`);
    else if (st.derived && st.status === 'drafting') add('warn', label, st.note, `mat:${m.id}`);
    else add('missing', label, st.note || (m.status === 'drafting' ? 'In progress' : 'Not started'), `mat:${m.id}`);
  }

  // Answers
  const answers = (app.answers || []).map((a) => {
    const words = wordCount(a.text);
    const chars = charCount(a.text);
    const over = (a.limit?.words && words > a.limit.words) || (a.limit?.chars && chars > a.limit.chars);
    const placeholders = /\[ADD:[^\]]*\]/.test(a.text || '');
    if (!a.text?.trim()) add('missing', `Answer: ${a.question.slice(0, 70)}`, 'Empty', `ans:${a.id}`);
    else if (over) add('warn', `Answer: ${a.question.slice(0, 70)}`, `Over the limit (${a.limit.words ? `${words}/${a.limit.words} words` : `${chars}/${a.limit.chars} characters`})`, `ans:${a.id}`);
    else if (placeholders) add('warn', `Answer: ${a.question.slice(0, 70)}`, 'Still contains [ADD: …] placeholders', `ans:${a.id}`);
    return { ...a, words, chars, over: Boolean(over), placeholders };
  });

  // Proposal (when no material covers it)
  const needsProposal = (f.requirements?.value || []).includes('Project proposal');
  if (!covered.has('proposal')) {
    const st = materialStatus({ type: 'proposal' }, app, opp, proposal);
    if (proposal) add(st.status === 'done' ? 'ok' : 'warn', `Proposal: ${proposal.title}`, st.status === 'done' ? (proposal.tailoredFor ? 'Tailored copy' : '') : st.note, 'proposal');
    else if (needsProposal) add('missing', 'Project proposal', 'The call asks for one. Choose or tailor a proposal.', 'proposal');
  }

  // Samples
  const items = db.list('portfolio');
  const samples = (app.samples || []).filter((s) => s.include !== false).map((s, i) => {
    const item = items.find((x) => x.id === s.itemId);
    return { order: i + 1, itemId: s.itemId, title: item?.title || '(removed from portfolio)', caption: s.caption || item?.caption || '', year: item?.year, medium: item?.medium, files: item?.files || [], links: item?.links || [], missing: !item };
  });
  const lim = sampleLimit(fieldText('workSamples', f.workSamples));
  if (samples.some((s) => s.missing)) add('missing', 'Work samples', 'A selected sample was removed from your portfolio.', 'samples');
  else if (covered.has('samples')) { /* reported with the materials */ }
  else if (lim && samples.length > lim.max) add('warn', 'Work samples', `${samples.length} selected; the call allows ${lim.max}.`, 'samples');
  else if (lim && samples.length < lim.min) add('warn', 'Work samples', `${samples.length} selected; the call asks for ${lim.min}${lim.max !== lim.min ? `–${lim.max}` : ''}.`, 'samples');
  else if (samples.length) add('ok', 'Work samples', `${samples.length} selected`, 'samples');
  else if ((f.requirements?.value || []).includes('Work samples') || f.workSamples) add('missing', 'Work samples', 'None selected yet.', 'samples');

  // Recommendations
  const contacts = db.list('contacts');
  const recs = (app.recommendations || []).map((r) => ({ ...r, name: contacts.find((c) => c.id === r.contactId)?.name || 'Unknown', email: contacts.find((c) => c.id === r.contactId)?.email || '', statusLabel: REC_STATUSES.find((s) => s.key === r.status)?.label || r.status }));
  const needed = /not required/i.test(fieldText('recommendations', f.recommendations)) ? 0 : requiredCount(fieldText('recommendations', f.recommendations));
  if (needed && !covered.has('letters')) {
    const ready = recs.filter((r) => ['agreed', 'submitted'].includes(r.status)).length;
    add(ready >= needed ? 'ok' : 'warn', `Recommendation letters (${ready}/${needed})`, ready >= needed ? '' : 'Ask recommenders early.', 'recs');
  }

  // Fee
  const fee = f.applicationFee?.value;
  if (fee && fee.amount > 0 && !covered.has('fee')) add(app.feePaid ? 'ok' : 'warn', `Application fee ${fieldText('applicationFee', f.applicationFee)}`, app.feePaid ? 'Marked as paid' : 'Pay when you submit', 'fee');

  const hash = reviewHash(app, proposal);
  const sub = app.submission || {};
  return {
    app, opp, proposal, samples, answers, recs, checklist,
    blockers: checklist.filter((c) => c.status === 'missing').length,
    warnings: checklist.filter((c) => c.status === 'warn').length,
    hash,
    confirmed: Boolean(sub.confirmedAt && sub.confirmedHash === hash),
    confirmedAt: sub.confirmedAt || null,
    changedSinceConfirm: Boolean(sub.confirmedAt && sub.confirmedHash !== hash),
    applyUrl: f.applyUrl?.value || f.website?.value || opp?.url || null,
  };
}

// ---------------------------------------------------------------- package export

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safe = (s) => String(s || 'Untitled').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);

export function reviewHtml(review, profile) {
  const { opp, proposal, samples, answers, recs, checklist } = review;
  const f = opp?.fields || {};
  const facts = ['organization', 'location', 'deadline', 'applicationFee', 'fundingType', 'eligibility', 'workSamples', 'recommendations', 'applyUrl']
    .map((k) => [FIELD_BY_KEY[k].label, fieldText(k, f[k])]).filter(([, v]) => v);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(oppName(opp))}</title><style>
  body{font:11pt/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#1d1b18;margin:0;padding:28px 36px}
  h1{font:600 20pt/1.2 "New York",Georgia,serif;margin:0 0 4px}h2{font:600 13pt/1.3 "New York",Georgia,serif;margin:22px 0 8px;border-bottom:1px solid #ddd5c8;padding-bottom:4px}
  .muted{color:#6b645a}table{border-collapse:collapse;width:100%}td{vertical-align:top;padding:3px 8px 3px 0}td:first-child{color:#6b645a;width:28%}
  .item{margin:0 0 14px}.q{font-weight:600}.text{white-space:pre-wrap}.ok{color:#3d6b3f}.warn{color:#9a6a12}.missing{color:#a33a2c}
  .check li{margin:2px 0}.sample{margin:0 0 8px}</style></head><body>
  <h1>${esc(oppName(opp))}</h1>
  <div class="muted">Application by ${esc(profile?.name || 'you')} · prepared in Atelier on ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
  <h2>Opportunity</h2><table>${facts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}<tr><td>Page</td><td>${esc(opp?.url || '')}</td></tr></table>
  <h2>Checklist</h2><ul class="check">${checklist.map((c) => `<li class="${c.status}">${c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : '✗'} ${esc(c.label)}${c.detail ? ` — <span class="muted">${esc(c.detail)}</span>` : ''}</li>`).join('')}</ul>
  ${answers.length ? `<h2>Answers</h2>${answers.map((a) => `<div class="item"><div class="q">${esc(a.question)}</div><div class="muted">${a.words} words · ${a.chars} characters${a.limit?.words ? ` · limit ${a.limit.words} words` : a.limit?.chars ? ` · limit ${a.limit.chars} characters` : ''}</div><div class="text">${esc(a.text)}</div></div>`).join('')}` : ''}
  ${proposal ? `<h2>Proposal: ${esc(proposal.title)}</h2>${PROPOSAL_SECTIONS.filter((s) => proposal.sections?.[s.key]).map((s) => `<div class="item"><div class="q">${esc(s.label)}</div><div class="text">${esc(proposal.sections[s.key])}</div></div>`).join('')}` : ''}
  ${samples.length ? `<h2>Work samples</h2>${samples.map((s) => `<div class="sample"><b>${s.order}. ${esc(s.title)}</b>${s.year ? `, ${esc(s.year)}` : ''}${s.medium ? ` — ${esc(s.medium)}` : ''}<div class="text">${esc(s.caption)}</div>${s.links.length ? `<div class="muted">${s.links.map((l) => esc(l.url)).join(' · ')}</div>` : ''}</div>`).join('')}` : ''}
  ${recs.length ? `<h2>Recommendations</h2><ul>${recs.map((r) => `<li>${esc(r.name)} — ${esc(r.statusLabel)}${r.dueDate ? ` (due ${esc(r.dueDate)})` : ''}</li>`).join('')}</ul>` : ''}
  </body></html>`;
}

/**
 * Write the application package to a folder.
 * @param {(html:string) => Promise<Buffer>} renderPdf
 */
export async function exportPackage({ review, profile, parentDir, portfolioFiles, renderPdf }) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(parentDir, `${safe(oppName(review.opp))} — application ${date}`);
  await fsp.mkdir(dir, { recursive: true });
  const html = reviewHtml(review, profile);
  if (renderPdf) {
    try { await fsp.writeFile(path.join(dir, 'Application summary.pdf'), await renderPdf(html)); } catch { await fsp.writeFile(path.join(dir, 'Application summary.html'), html); }
  } else await fsp.writeFile(path.join(dir, 'Application summary.html'), html);

  if (review.answers.length) {
    await fsp.writeFile(path.join(dir, 'Answers.txt'), review.answers.map((a) => `${a.question}\n${'-'.repeat(Math.min(60, a.question.length))}\n${a.text || ''}\n`).join('\n'));
  }
  if (review.proposal) {
    const p = review.proposal;
    await fsp.writeFile(path.join(dir, 'Proposal.txt'), [p.title, '', ...PROPOSAL_SECTIONS.filter((s) => p.sections?.[s.key]).map((s) => `${s.label}\n${p.sections[s.key]}\n`)].join('\n'));
  }
  if (review.samples.length) {
    const sdir = path.join(dir, 'Work samples');
    await fsp.mkdir(sdir, { recursive: true });
    const captions = [];
    for (const s of review.samples) {
      const n = String(s.order).padStart(2, '0');
      captions.push(`${n}. ${s.title}${s.year ? `, ${s.year}` : ''}${s.medium ? `. ${s.medium}` : ''}${s.caption ? `\n    ${s.caption}` : ''}${s.links.length ? `\n    ${s.links.map((l) => l.url).join('  ')}` : ''}`);
      let k = 0;
      for (const file of s.files) {
        const src = portfolioFiles.pathOf(file);
        if (!fs.existsSync(src)) continue;
        k += 1;
        const ext = path.extname(file.name);
        await fsp.copyFile(src, path.join(sdir, `${n}${s.files.length > 1 ? `-${k}` : ''} ${safe(s.title)}${ext}`));
      }
    }
    await fsp.writeFile(path.join(sdir, 'Captions.txt'), `${captions.join('\n\n')}\n`);
  }
  const mats = (review.app.materials || []).filter((m) => m.file);
  if (mats.length) {
    const mdir = path.join(dir, 'Materials');
    await fsp.mkdir(mdir, { recursive: true });
    for (const m of mats) {
      const src = portfolioFiles.pathOf(m.file);
      if (fs.existsSync(src)) await fsp.copyFile(src, path.join(mdir, safe(m.file.name)));
    }
  }
  return { dir };
}
