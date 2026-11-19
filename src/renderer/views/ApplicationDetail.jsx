// Working on one application: materials, proposal, answers, samples, letters, and the final review.
import { useState, useEffect } from 'preact/hooks';
import { diffWords } from 'diff';
import {
  ChevronLeft, ExternalLink, Trash2, Plus, X, ArrowUp, ArrowDown, Paperclip, FolderOpen, Sparkles, Check, CircleX, TriangleAlert,
  Mail, Package, Send, FileText, BookmarkPlus, Scissors, CircleCheck,
} from 'lucide-preact';
import { data, call, back, go, byId, meta, toast, setRouteParams, openModal, confirmDialog } from '../lib/store.js';
import {
  oppName, fieldText, APP_STATUSES, MATERIAL_TYPES, MATERIAL_STATUS, REC_STATUSES, PROPOSAL_SECTIONS, FIELD_BY_KEY, uid, wordCount, deadlineOf,
  materialStatus,
} from '../../shared/schema.mjs';
import { tailoringSuggestions } from '../../shared/tailor.mjs';
import { Button, IconButton, Badge, Tabs, Select, TextInput, TextArea, Provenance, DeadlineBadge, Empty, Spinner, Toggle } from '../components/Common.jsx';
import { fmtDate, ago, countdown } from '../lib/format.js';

// ---------------------------------------------------------------- overview

function factText(k, fv) {
  if (!fv) return '';
  if ((k === 'deadline' || k === 'openingDate') && fv.value && fv.value !== 'rolling') return fmtDate(fv.value, { dateStyle: 'long' });
  return fieldText(k, fv);
}

function Overview({ app, opp }) {
  const upd = (patch) => call('app:update', app.id, patch);
  const [note, setNote] = useState('');
  const facts = ['deadline', 'applicationFee', 'eligibility', 'workSamples', 'recommendations', 'requirements', 'applyUrl'];
  const fee = opp.fields?.applicationFee?.value;
  return (
    <div class="two-col">
      <div>
        <div class="form-grid">
          <label>Status</label>
          <Select value={app.status} onChange={(v) => upd({ status: v })} options={APP_STATUSES.map((s) => ({ value: s.key, label: s.label }))} />
          <label>Your target date</label>
          <div class="inline-fields"><input class="input" type="date" value={app.targetDate || ''} onChange={(e) => upd({ targetDate: e.currentTarget.value || null })} /><span class="muted small">Finish by this date (shown on the calendar)</span></div>
          {fee?.amount > 0 && <><label>Application fee</label><label class="check"><input type="checkbox" checked={!!app.feePaid} onChange={(e) => upd({ feePaid: e.currentTarget.checked })} /> Paid ({fieldText('applicationFee', opp.fields.applicationFee)})</label></>}
        </div>
        <h3 class="sub-head">What the call asks for</h3>
        <div class="facts">
          {facts.map((k) => (
            <div class="fact">
              <div class="fact-label">{FIELD_BY_KEY[k].label}</div>
              <div class="fact-value">{factText(k, opp.fields?.[k]) || <span class="muted">Not found</span>}</div>
              {opp.fields?.[k] && <Provenance fv={opp.fields[k]} important compact />}
            </div>
          ))}
        </div>
        <Button small kind="ghost" onClick={() => go('opportunity', { id: opp.id })}>See all details and their sources</Button>
      </div>
      <div>
        <h3 class="sub-head">Notes</h3>
        <form class="note-add" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; upd({ notes: [{ id: uid('n_'), at: new Date().toISOString(), text: note.trim() }, ...(app.notes || [])] }); setNote(''); }}>
          <textarea class="textarea" rows={3} value={note} placeholder="Add a note (Return to save, Shift-Return for a new line)" onInput={(e) => setNote(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
        </form>
        <ul class="notes-log">
          {(app.notes || []).map((n) => (
            <li><div class="muted small">{fmtDate(n.at, { dateStyle: 'medium' })}<IconButton icon={X} label="Delete note" size={12} onClick={() => upd({ notes: app.notes.filter((x) => x.id !== n.id) })} /></div><div class="note-text">{n.text}</div></li>
          ))}
        </ul>
        <h3 class="sub-head">History</h3>
        <ul class="status-history">
          {(app.statusHistory || []).slice().reverse().map((h) => <li><b>{APP_STATUSES.find((s) => s.key === h.status)?.label || h.status}</b> <span class="muted">{fmtDate(h.at, { dateStyle: 'medium' })}</span></li>)}
          {app.submission?.confirmedAt && <li><b>Review confirmed</b> <span class="muted">{fmtDate(app.submission.confirmedAt, { dateStyle: 'medium' })}</span></li>}
          {app.submission?.submittedAt && <li><b>Submitted</b> <span class="muted">{fmtDate(app.submission.submittedAt)}{app.submission.reference ? ` · ${app.submission.reference}` : ''}</span></li>}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- materials

function Materials({ app, opp }) {
  const mats = app.materials || [];
  const proposal = app.proposalId ? data.value.proposals.find((p) => p.id === app.proposalId) : null;
  const set = (next) => call('app:update', app.id, { materials: next });
  const patch = (id, p) => set(mats.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const snippets = data.value.snippets;
  const move = (i, d) => { const n = [...mats]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); set(n); };
  return (
    <div class="materials">
      <p class="muted">Set up from what the call asks for. Add anything else you need to prepare. Attached files are copied into Atelier and included in backups if you choose.</p>
      {mats.map((m, i) => {
        const st = materialStatus(m, app, opp, proposal);
        return (
        <div class={`material status-${st.status}`}>
          {st.derived
            ? <div class={`mat-derived tone-${st.status === 'done' ? 'ok' : st.status === 'drafting' ? 'warn' : 'muted'}`} title="Worked out from this application">{MATERIAL_STATUS.find((s) => s.key === st.status)?.label}<small>{st.note}</small></div>
            : <Select value={m.status} onChange={(v) => patch(m.id, { status: v })} options={MATERIAL_STATUS.map((s) => ({ value: s.key, label: s.label }))} class="mat-status" />}
          <div class="material-main">
            <input class="input mat-label" value={m.label} onChange={(e) => patch(m.id, { label: e.currentTarget.value })} />
            <div class="material-links">
              {m.type === 'proposal' && <button type="button" class="link" onClick={() => setRouteParams({ tab: 'proposal' })}>{app.proposalId ? 'Open the proposal' : 'Choose or tailor a proposal'}</button>}
              {m.type === 'samples' && <button type="button" class="link" onClick={() => setRouteParams({ tab: 'samples' })}>{(app.samples || []).length ? `${app.samples.length} selected` : 'Choose samples'}</button>}
              {m.type === 'letters' && <button type="button" class="link" onClick={() => setRouteParams({ tab: 'letters' })}>{(app.recommendations || []).length ? 'Recommenders' : 'Add recommenders'}</button>}
              {['cv', 'statement', 'bio', 'letter-of-intent', 'timeline', 'budget', 'other'].includes(m.type) && (
                <Select value={m.snippetId || ''} onChange={(v) => patch(m.id, { snippetId: v || null, status: v && m.status === 'todo' ? 'done' : m.status })}
                  options={[{ value: '', label: 'Use saved text…' }, ...snippets.map((s) => ({ value: s.id, label: `${s.title} (${wordCount(s.text)} words)` }))]} />
              )}
              {m.file ? (
                <span class="file-chip">
                  <FileText size={12} /> {m.file.name}
                  <IconButton icon={ExternalLink} label="Open" size={12} onClick={() => call('file:open', m.file.id)} />
                  <IconButton icon={FolderOpen} label="Show in Finder" size={12} onClick={() => call('file:reveal', m.file.id)} />
                  <IconButton icon={X} label="Remove file" size={12} onClick={() => patch(m.id, { file: null })} />
                </span>
              ) : m.type !== 'samples' && m.type !== 'letters' && m.type !== 'fee' && <Button small kind="ghost" icon={Paperclip} onClick={() => call('app:attachFile', app.id, m.id)}>Attach file</Button>}
            </div>
          </div>
          <label class="check small"><input type="checkbox" checked={m.required !== false} onChange={(e) => patch(m.id, { required: e.currentTarget.checked })} /> Required</label>
          <div class="row-tools">
            <IconButton icon={ArrowUp} label="Move up" size={13} disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ArrowDown} label="Move down" size={13} disabled={i === mats.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={Trash2} label="Remove" size={13} onClick={() => set(mats.filter((x) => x.id !== m.id))} />
          </div>
        </div>
        );
      })}
      <div class="add-row">
        <Select value="" onChange={(type) => { if (!type) return; set([...mats, { id: uid('m_'), type, label: MATERIAL_TYPES.find((t) => t.key === type).label, required: true, status: 'todo' }]); }}
          options={[{ value: '', label: '+ Add material…' }, ...MATERIAL_TYPES.map((t) => ({ value: t.key, label: t.label }))]} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- proposal

function SectionDiff({ before, after }) {
  const parts = diffWords(before || '', after || '');
  return <div class="diff">{parts.map((p) => (p.added ? <ins>{p.value}</ins> : p.removed ? <del>{p.value}</del> : <span>{p.value}</span>))}</div>;
}

function ProposalTab({ app, opp }) {
  const props = data.value.proposals;
  const proposal = app.proposalId ? props.find((p) => p.id === app.proposalId) : null;
  const originals = props.filter((p) => !p.tailoredFrom);
  const [base, setBase] = useState(originals[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [proposed, setProposed] = useState(null);
  const ai = meta.value.ai;

  if (!proposal) {
    const make = async (withAi) => {
      if (!base) return;
      setBusy(true);
      let sections; let notes;
      if (withAi) {
        const r = await call('ai:tailor', { proposalId: base, oppId: opp.id, suggestions: tailoringSuggestions(props.find((p) => p.id === base), opp) });
        if (!r || r.error || r.canceled) { setBusy(false); return; }
        sections = r.sections; notes = r.notes;
      }
      await call('writing:createTailored', { proposalId: base, oppId: opp.id, appId: app.id, sections, notes });
      setBusy(false);
      toast(withAi ? 'Tailored copy created with AI suggestions. Your original is unchanged.' : 'Tailored copy created. Your original is unchanged.', 'success');
    };
    return (
      <div class="proposal-pick">
        {originals.length ? (
          <>
            <p>Pick one of your proposals. Atelier makes a <b>tailored copy</b> for this opportunity, so your original stays as it is.</p>
            <div class="inline-fields">
              <Select value={base} onChange={setBase} options={originals.map((p) => ({ value: p.id, label: p.title }))} />
              <Button kind="primary" disabled={busy || !base} onClick={() => make(false)}>Make a tailored copy</Button>
              <Button icon={Sparkles} disabled={busy || !base || ai.provider === 'off'} title={ai.provider === 'off' ? 'Turn on AI in Settings › AI' : `Uses ${ai.label}`} onClick={() => make(true)}>{busy ? 'Working…' : 'Tailored copy with AI suggestions'}</Button>
            </div>
          </>
        ) : <p>You don’t have a proposal yet.</p>}
        <p><Button icon={Plus} onClick={() => openModal('guidedProposal', { attachTo: { appId: app.id, oppId: opp.id } })}>Write a new proposal (guided)</Button></p>
      </div>
    );
  }

  const orig = proposal.tailoredFrom?.originalSections || {};
  const suggestions = tailoringSuggestions(proposal, opp);
  const setSection = (key, text) => call('col:update', 'proposals', proposal.id, { sections: { ...proposal.sections, [key]: text } });
  const askAi = async () => {
    setBusy(true);
    const r = await call('ai:tailor', { proposalId: proposal.id, oppId: opp.id, suggestions });
    setBusy(false);
    if (r && !r.error && !r.canceled) setProposed(r);
  };
  return (
    <div class="proposal-tab">
      <div class="banner tone-plain">
        <span>{proposal.tailoredFrom ? <>Tailored copy of <b>{proposal.tailoredFrom.title}</b> for this opportunity. Your original is unchanged.</> : <>Using <b>{proposal.title}</b> directly. Edits here change that proposal.</>}</span>
        <div class="banner-actions">
          {proposal.tailoredFrom && <Toggle checked={showDiff} onChange={setShowDiff} label="Show changes from original" />}
          <Button small kind="ghost" onClick={() => go('writing', { proposalId: proposal.tailoredFrom?.proposalId || proposal.id })}>Open {proposal.tailoredFrom ? 'original' : 'in Proposals'}</Button>
          <Button small kind="ghost" onClick={async () => { if (await confirmDialog('Stop using this proposal for this application?', 'The tailored copy stays in Proposals & Text.')) call('app:update', app.id, { proposalId: null }); }}>Change</Button>
        </div>
      </div>
      <div class="two-col proposal-cols">
        <div>
          {PROPOSAL_SECTIONS.map((s) => (
            <div class="prop-section">
              <div class="prop-section-head"><h4>{s.label}</h4><span class="muted small">{s.hint}</span></div>
              {showDiff && proposal.tailoredFrom ? <SectionDiff before={orig[s.key]} after={proposal.sections?.[s.key]} />
                : <TextArea value={proposal.sections?.[s.key] || ''} rows={s.key === 'summary' ? 2 : 6} onSave={(t) => setSection(s.key, t)} />}
              {proposed?.sections?.[s.key] && proposed.sections[s.key] !== proposal.sections?.[s.key] && (
                <div class="proposed">
                  <div class="proposed-head"><Sparkles size={13} /> Suggested edit <span class="spacer" />
                    <Button small kind="primary" onClick={() => { setSection(s.key, proposed.sections[s.key]); setProposed({ ...proposed, sections: { ...proposed.sections, [s.key]: undefined } }); }}>Accept</Button>
                    <Button small kind="ghost" onClick={() => setProposed({ ...proposed, sections: { ...proposed.sections, [s.key]: undefined } })}>Discard</Button>
                  </div>
                  <SectionDiff before={proposal.sections?.[s.key]} after={proposed.sections[s.key]} />
                </div>
              )}
            </div>
          ))}
        </div>
        <aside class="side-panel">
          <h4>Tailoring checklist</h4>
          <p class="muted small">From comparing your proposal with this call. Works without AI.</p>
          <ul class="suggestions">
            {suggestions.length ? suggestions.map((s) => (
              <li><span class="sug-section">{PROPOSAL_SECTIONS.find((x) => x.key === s.section)?.label}</span>{s.text}
                {s.insert && <button type="button" class="link small" onClick={() => setSection(s.section, `${proposal.sections?.[s.section] || ''}${proposal.sections?.[s.section] ? '\n\n' : ''}${s.insert}`)}>Insert a starter sentence</button>}
              </li>
            )) : <li class="muted">Nothing obvious left to tailor.</li>}
          </ul>
          <Button icon={Sparkles} disabled={busy || ai.provider === 'off'} title={ai.provider === 'off' ? 'Turn on AI in Settings › AI' : `Uses ${ai.label}`} onClick={askAi}>{busy ? 'Thinking…' : 'Suggest edits with AI'}</Button>
          {(proposed?.notes?.length > 0 || proposal.aiNotes?.length > 0) && (
            <>
              <h4>AI notes</h4>
              <ul class="suggestions">{(proposed?.notes || proposal.aiNotes).map((n) => <li><span class="sug-section">{PROPOSAL_SECTIONS.find((x) => x.key === n.section)?.label || n.section}</span>{n.change}{n.reason ? <span class="muted"> — {n.reason}</span> : ''}</li>)}</ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- answers

function AnswerCard({ app, a, setAll, all }) {
  const ai = meta.value.ai;
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState('');
  const patch = (p) => setAll(all.map((x) => (x.id === a.id ? { ...x, ...p } : x)));
  const limitUnit = a.limit?.chars ? 'chars' : 'words';
  const limitVal = a.limit?.chars || a.limit?.words || '';
  const snippets = data.value.snippets;
  const over = (a.limit?.words && wordCount(a.text) > a.limit.words) || (a.limit?.chars && [...(a.text || '')].length > a.limit.chars);
  return (
    <div class="answer">
      <div class="answer-head">
        <TextInput value={a.question} onSave={(q) => patch({ question: q })} placeholder="The question, as written on the form" class="answer-q" />
        <div class="inline-fields limit">
          <span class="muted small">Limit</span>
          <input class="input input-num" type="number" min="0" value={limitVal} onChange={(e) => { const n = Number(e.currentTarget.value) || null; patch({ limit: n ? { [limitUnit]: n } : null }); }} />
          <Select value={limitUnit} onChange={(u) => patch({ limit: limitVal ? { [u]: Number(limitVal) } : null })} options={[{ value: 'words', label: 'words' }, { value: 'chars', label: 'characters' }]} />
        </div>
        <IconButton icon={Trash2} label="Remove question" onClick={async () => { if (!a.text || await confirmDialog('Remove this question and its answer?')) setAll(all.filter((x) => x.id !== a.id)); }} />
      </div>
      <TextArea value={a.text} rows={7} limit={a.limit} onSave={(text) => patch({ text, updatedAt: new Date().toISOString() })} />
      <div class="answer-tools">
        <Select value="" onChange={(id) => { const s = snippets.find((x) => x.id === id); if (s) patch({ text: `${a.text ? `${a.text}\n\n` : ''}${s.text}` }); }}
          options={[{ value: '', label: 'Insert saved text…' }, ...snippets.map((s) => ({ value: s.id, label: s.title }))]} />
        <input class="input" placeholder="Notes for the AI draft (optional)" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} disabled={ai.provider === 'off'} />
        <Button small icon={Sparkles} disabled={!!busy || ai.provider === 'off' || !a.question} title={ai.provider === 'off' ? 'Turn on AI in Settings › AI' : ''}
          onClick={async () => {
            if (a.text && !(await confirmDialog('Replace the current answer with an AI draft?', 'Your current text is kept, and you can restore it afterwards.', { confirmLabel: 'Draft' }))) return;
            setBusy('draft');
            const r = await call('ai:draftAnswer', { appId: app.id, question: a.question, limit: a.limit, notes });
            setBusy('');
            if (r?.text) patch({ text: r.text, previousText: a.text || null, aiDraftAt: new Date().toISOString() });
          }}>{busy === 'draft' ? 'Drafting…' : 'Draft with AI'}</Button>
        {over && <Button small icon={Scissors} disabled={!!busy || ai.provider === 'off'} onClick={async () => { setBusy('short'); const r = await call('ai:shorten', { text: a.text, limit: a.limit }); setBusy(''); if (r?.text) patch({ text: r.text, previousText: a.text }); }}>{busy === 'short' ? 'Shortening…' : 'Shorten with AI'}</Button>}
        <span class="spacer" />
        <Button small kind="ghost" icon={BookmarkPlus} disabled={!a.text} onClick={async () => { await call('col:create', 'snippets', { title: a.question.slice(0, 80) || 'Answer', kind: 'answer', text: a.text, tags: [], sourceAppId: app.id }); toast('Saved to Proposals & Text', 'success'); }}>Save for reuse</Button>
      </div>
      {(a.aiDraftAt || a.previousText) && (
        <p class="muted small">
          {a.aiDraftAt && <>AI draft from {ago(a.aiDraftAt)} — check every fact, and replace any [ADD: …] placeholders. </>}
          {a.previousText && <button type="button" class="link small" onClick={() => patch({ text: a.previousText, previousText: a.text, aiDraftAt: null })}>Restore your previous text</button>}
        </p>
      )}
    </div>
  );
}

function Answers({ app }) {
  const all = app.answers || [];
  const setAll = (answers) => call('app:update', app.id, { answers });
  const [bulk, setBulk] = useState('');
  return (
    <div class="answers">
      <p class="muted">Copy each question from the application form, with its word or character limit. Counts update as you type.</p>
      {all.map((a) => <AnswerCard key={a.id} app={app} a={a} all={all} setAll={setAll} />)}
      <div class="add-row">
        <Button icon={Plus} onClick={() => setAll([...all, { id: uid('q_'), question: '', text: '', limit: null }])}>Add a question</Button>
        <details class="bulk">
          <summary>Paste several questions</summary>
          <textarea class="textarea" rows={4} value={bulk} placeholder="One question per line" onInput={(e) => setBulk(e.currentTarget.value)} />
          <Button small onClick={() => { const qs = bulk.split('\n').map((l) => l.trim()).filter(Boolean); if (!qs.length) return; setAll([...all, ...qs.map((q) => { const m = /\((\d+)\s*(words?|characters?|chars?)\b/i.exec(q); return { id: uid('q_'), question: q, text: '', limit: m ? { [/^w/i.test(m[2]) ? 'words' : 'chars']: Number(m[1]) } : null }; })]); setBulk(''); }}>Add questions</Button>
        </details>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- samples

function Samples({ app, opp }) {
  const items = data.value.portfolio;
  const projects = data.value.projects;
  const [project, setProject] = useState('');
  const selected = (app.samples || []).filter((s) => s.include !== false);
  const set = (samples) => call('app:update', app.id, { samples });
  const has = (id) => selected.some((s) => s.itemId === id);
  const toggle = (id) => set(has(id) ? selected.filter((s) => s.itemId !== id) : [...selected, { itemId: id, caption: '' }]);
  const move = (i, d) => { const n = [...selected]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); set(n); };
  const req = fieldText('workSamples', opp.fields?.workSamples);
  const shown = items.filter((it) => !project || it.projectId === project);
  if (!items.length) return <Empty title="Your portfolio is empty"><p>Add work samples in <button type="button" class="link" onClick={() => go('portfolio')}>Portfolio</button>, then choose them here.</p></Empty>;
  return (
    <div class="samples two-col">
      <div>
        <div class="inline-fields"><h4>Portfolio</h4><span class="spacer" />{projects.length > 0 && <Select value={project} onChange={setProject} options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.title }))]} />}</div>
        <div class="pick-grid">
          {shown.map((it) => {
            const f = it.files?.[0];
            return (
              <button type="button" class={`pick${has(it.id) ? ' picked' : ''}`} onClick={() => toggle(it.id)}>
                <div class="pick-thumb">{f ? <img src={`atelier-thumb://thumb/${f.id}`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}<span class="pick-kind">{f?.kind || (it.links?.length ? 'link' : '')}</span></div>
                <div class="pick-title">{it.title}</div>
                {has(it.id) && <span class="pick-num">{selected.findIndex((s) => s.itemId === it.id) + 1}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <aside class="side-panel">
        <h4>Selected for this application ({selected.length})</h4>
        {req && <p class="muted small">The call says: “{req.slice(0, 260)}”</p>}
        <ol class="selected-list">
          {selected.map((s, i) => {
            const it = items.find((x) => x.id === s.itemId);
            return (
              <li>
                <div class="sel-head"><b>{i + 1}. {it?.title || '(removed)'}</b><span class="spacer" />
                  <IconButton icon={ArrowUp} label="Earlier" size={12} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="Later" size={12} disabled={i === selected.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={X} label="Remove" size={12} onClick={() => toggle(s.itemId)} />
                </div>
                <TextInput value={s.caption} placeholder={it?.caption || 'Caption for this application (optional)'} onSave={(c) => set(selected.map((x, j) => (j === i ? { ...x, caption: c } : x)))} />
              </li>
            );
          })}
        </ol>
        {!selected.length && <p class="muted">Click works on the left to add them, in order.</p>}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- recommendation letters

function requestTemplate({ contact, opp, profile, app }) {
  const first = (contact?.name || '').split(' ')[0] || 'there';
  const dl = deadlineOf(opp);
  const org = fieldText('organization', opp.fields?.organization);
  return {
    subject: `Recommendation letter request — ${oppName(opp)}`,
    body: `Dear ${first},\n\nI’m applying to ${oppName(opp)}${org ? ` (${org})` : ''}, and I’d be grateful if you would write a letter of recommendation for me.${dl.kind === 'date' ? ` The application deadline is ${fmtDate(dl.date, { dateStyle: 'long' })}.` : ''}\n\n${fieldText('recommendations', opp.fields?.recommendations) ? `What they ask for: ${fieldText('recommendations', opp.fields.recommendations)}\n\n` : ''}I can send my proposal, CV and work samples — just let me know what would help.\n\nThank you,\n${profile?.name || ''}`,
  };
}

function Letters({ app, opp }) {
  const contacts = data.value.contacts;
  const recs = app.recommendations || [];
  const set = (recommendations) => call('app:update', app.id, { recommendations });
  const patch = (id, p) => set(recs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const [drafting, setDrafting] = useState(null);
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const asks = fieldText('recommendations', opp.fields?.recommendations);
  return (
    <div class="letters">
      {asks && <p class="muted">The call says: “{asks}”</p>}
      {!contacts.length && <p class="banner tone-plain">Add recommenders (name and email) in <button type="button" class="link" onClick={() => go('profile', {})}>Artist Profile › Recommenders</button>.</p>}
      {recs.map((r) => {
        const c = contacts.find((x) => x.id === r.contactId);
        return (
          <div class="rec">
            <div class="rec-row">
              <Select value={r.contactId || ''} onChange={(v) => patch(r.id, { contactId: v })} options={[{ value: '', label: 'Choose recommender…' }, ...contacts.map((x) => ({ value: x.id, label: x.name }))]} />
              <Select value={r.status} onChange={(v) => patch(r.id, { status: v })} options={REC_STATUSES.map((s) => ({ value: s.key, label: s.label }))} />
              <label class="inline-fields small">Letter due <input class="input" type="date" value={r.dueDate || ''} onChange={(e) => patch(r.id, { dueDate: e.currentTarget.value || null })} /></label>
              {r.requestedAt && <span class="muted small">Asked {fmtDate(r.requestedAt)}</span>}
              <span class="spacer" />
              <Button small icon={Mail} disabled={!c} onClick={() => { setDrafting(r.id); setDraft(r.requestDraft || requestTemplate({ contact: c, opp, profile: data.value.profile, app })); }}>Draft request</Button>
              <IconButton icon={Trash2} label="Remove" onClick={() => set(recs.filter((x) => x.id !== r.id))} />
            </div>
            {drafting === r.id && (
              <div class="rec-draft">
                <input class="input" value={draft.subject} onInput={(e) => setDraft({ ...draft, subject: e.currentTarget.value })} />
                <textarea class="textarea" rows={10} value={draft.body} onInput={(e) => setDraft({ ...draft, body: e.currentTarget.value })} />
                <div class="inline-fields">
                  <Button kind="primary" icon={Send} onClick={async () => { const res = await call('rec:sendRequest', app.id, r.id, draft); if (res?.ok) setDrafting(null); }}>Review and open in Mail</Button>
                  <Button kind="ghost" onClick={() => { patch(r.id, { requestDraft: draft }); setDrafting(null); }}>Save draft</Button>
                  <span class="muted small">Mail opens with the message; you send it. {c?.email ? `To: ${c.email}` : 'This recommender has no email address yet.'}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button icon={Plus} onClick={() => set([...recs, { id: uid('r_'), contactId: contacts[0]?.id || '', status: 'to-ask', dueDate: null }])}>Add a recommender</Button>
    </div>
  );
}

// ---------------------------------------------------------------- review and submit

const CHECK_ICON = { ok: CircleCheck, warn: TriangleAlert, missing: CircleX };

function Review({ app, opp }) {
  const [review, setReview] = useState(null);
  const [agree, setAgree] = useState(false);
  const [subForm, setSubForm] = useState(null);
  const load = () => call('app:review', app.id).then(setReview);
  useEffect(() => { load(); setAgree(false); }, [app.updatedAt, opp.updatedAt, data.value.proposals]);
  if (!review) return <Spinner label="Preparing the review…" />;
  const confirmNow = async () => { const r = await call('app:confirm', app.id, review.hash); if (r?.ok) { toast('Review confirmed. You can now open the application form.', 'success'); load(); } };
  return (
    <div class="review">
      <div class={`review-status ${review.confirmed ? 'tone-ok' : review.changedSinceConfirm ? 'tone-warn' : 'tone-plain'}`}>
        {review.confirmed ? <><CircleCheck size={18} /> <div><b>You confirmed this application {ago(review.confirmedAt)}.</b> It hasn’t changed since.</div></>
          : review.changedSinceConfirm ? <><TriangleAlert size={18} /> <div><b>Changed since you confirmed it.</b> Review it again before submitting.</div></>
            : <><FileText size={18} /> <div><b>Review the complete application below.</b> Nothing is sent anywhere until you confirm and then submit it yourself on the organizer’s form.</div></>}
      </div>

      <h3 class="sub-head">Checklist</h3>
      <ul class="checklist">
        {review.checklist.map((c) => { const I = CHECK_ICON[c.status]; return <li class={`tone-${c.status === 'missing' ? 'bad' : c.status === 'warn' ? 'warn' : 'ok'}`}><I size={14} /> <b>{c.label}</b>{c.detail && <span class="muted"> — {c.detail}</span>}</li>; })}
      </ul>

      {review.answers.length > 0 && (
        <>
          <h3 class="sub-head">Answers</h3>
          {review.answers.map((a) => (
            <div class="review-item"><div class="review-q">{a.question}</div><div class="muted small">{a.words} words · {a.chars} characters{a.over ? ' · over the limit' : ''}</div><div class="review-text">{a.text || <span class="muted">Empty</span>}</div></div>
          ))}
        </>
      )}
      {review.proposal && (
        <>
          <h3 class="sub-head">Proposal: {review.proposal.title}</h3>
          {PROPOSAL_SECTIONS.filter((s) => review.proposal.sections?.[s.key]).map((s) => <div class="review-item"><div class="review-q">{s.label}</div><div class="review-text">{review.proposal.sections[s.key]}</div></div>)}
        </>
      )}
      {review.samples.length > 0 && (
        <>
          <h3 class="sub-head">Work samples</h3>
          <ol class="review-samples">{review.samples.map((s) => <li><b>{s.title}</b>{s.year ? `, ${s.year}` : ''}{s.medium ? ` — ${s.medium}` : ''}{s.caption ? <div class="muted">{s.caption}</div> : null}</li>)}</ol>
        </>
      )}
      {review.recs.length > 0 && (
        <>
          <h3 class="sub-head">Recommendations</h3>
          <ul>{review.recs.map((r) => <li>{r.name} — {r.statusLabel}{r.dueDate ? ` (due ${fmtDate(r.dueDate)})` : ''}</li>)}</ul>
        </>
      )}

      <div class="confirm-box">
        {!review.confirmed ? (
          <>
            {review.blockers > 0 && <p class="tone-bad"><b>{review.blockers} required item{review.blockers === 1 ? ' is' : 's are'} missing.</b> You can still confirm if you know the form doesn’t need {review.blockers === 1 ? 'it' : 'them'}.</p>}
            <label class="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.currentTarget.checked)} /> I’ve read everything above, checked the details on the official page, and this is what I want to submit.</label>
            <Button kind="primary" icon={Check} disabled={!agree} onClick={confirmNow}>Confirm review</Button>
          </>
        ) : (
          <div class="inline-fields wrap">
            <Button icon={Package} onClick={() => call('app:exportPackage', app.id)}>Export package…</Button>
            <Button kind="primary" icon={ExternalLink} onClick={() => call('app:openPortal', app.id)} disabled={!review.applyUrl}>Open application form</Button>
            <Button icon={Send} onClick={() => setSubForm({ submittedAt: new Date().toISOString().slice(0, 10), reference: '' })}>Mark as submitted…</Button>
            <Button kind="ghost" onClick={() => call('app:unconfirm', app.id)}>Undo confirmation</Button>
          </div>
        )}
        {!review.confirmed && <p class="muted small">After you confirm, Atelier can export a package (summary PDF, answers, numbered samples with captions) and open the organizer’s form for you to submit.</p>}
        {subForm && (
          <form class="inline-fields wrap sub-form" onSubmit={async (e) => { e.preventDefault(); const r = await call('app:markSubmitted', app.id, subForm); if (r?.ok) { setSubForm(null); toast('Marked as submitted', 'success'); } }}>
            <label class="small">Submitted on <input class="input" type="date" value={subForm.submittedAt} onInput={(e) => setSubForm({ ...subForm, submittedAt: e.currentTarget.value })} /></label>
            <input class="input" placeholder="Confirmation number or note (optional)" value={subForm.reference} onInput={(e) => setSubForm({ ...subForm, reference: e.currentTarget.value })} />
            <Button kind="primary" type="submit">Save</Button>
            <Button kind="ghost" onClick={() => setSubForm(null)}>Cancel</Button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export function ApplicationDetail({ id, tab = 'overview' }) {
  const app = data.value.applications.find((a) => a.id === id);
  const opp = app && byId.value.opportunities.get(app.opportunityId);
  if (!app || !opp) return <div class="page"><Empty title="This application was deleted"><Button onClick={back}>Go back</Button></Empty></div>;
  const proposal = app.proposalId ? data.value.proposals.find((p) => p.id === app.proposalId) : null;
  const mats = (app.materials || []).filter((m) => m.required !== false);
  const matsDone = mats.filter((m) => materialStatus(m, app, opp, proposal).status === 'done').length;
  const recs = app.recommendations || [];
  return (
    <div class="page">
      <button type="button" class="back-link" onClick={back}><ChevronLeft size={14} /> Back</button>
      <header class="detail-head">
        <div class="detail-title">
          <div class="eyebrow">Application</div>
          <h1><button type="button" class="title-link" onClick={() => go('opportunity', { id: opp.id })}>{oppName(opp)}</button></h1>
          <div class="detail-badges">
            <DeadlineBadge opp={opp} long />
            <Badge tone="accent">{APP_STATUSES.find((s) => s.key === app.status)?.label}</Badge>
            {app.targetDate && <Badge tone="soft">Your target {fmtDate(app.targetDate, { month: 'short', day: 'numeric' })} · {countdown(app.targetDate).replace('due ', '')}</Badge>}
            {app.submission?.confirmedAt && <Badge tone="ok" icon={Check}>Reviewed</Badge>}
          </div>
        </div>
        <div class="detail-actions">
          <IconButton icon={Trash2} label="Delete application" onClick={async () => { if (await call('app:delete', app.id)) back(); }} />
        </div>
      </header>
      <Tabs value={tab} onChange={(t) => setRouteParams({ tab: t })} tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'materials', label: `Materials ${matsDone}/${mats.length}` },
        { key: 'proposal', label: 'Proposal' },
        { key: 'answers', label: 'Answers', count: (app.answers || []).length },
        { key: 'samples', label: 'Samples', count: (app.samples || []).length },
        { key: 'letters', label: 'Letters', count: recs.length },
        { key: 'review', label: 'Review & submit' },
      ]} />
      <div class="tab-body">
        {tab === 'overview' && <Overview app={app} opp={opp} />}
        {tab === 'materials' && <Materials app={app} opp={opp} />}
        {tab === 'proposal' && <ProposalTab app={app} opp={opp} />}
        {tab === 'answers' && <Answers app={app} />}
        {tab === 'samples' && <Samples app={app} opp={opp} />}
        {tab === 'letters' && <Letters app={app} opp={opp} />}
        {tab === 'review' && <Review app={app} opp={opp} />}
      </div>
    </div>
  );
}
