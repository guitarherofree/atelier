// Dialogs: add from URL, add by hand, search the web, and the guided proposal form.
import { useState, useEffect } from 'preact/hooks';
import { Link, Plus, Search as SearchIcon, Globe, ExternalLink, Check, TriangleAlert, ChevronLeft, ChevronRight } from 'lucide-preact';
import { modal, closeModal, call, go, data, meta, toast } from '../lib/store.js';
import { OPP_FIELDS, FIELD_BY_KEY, PROPOSAL_SECTIONS, wordCount } from '../../shared/schema.mjs';
import { Modal, Button, Select, Spinner, FormRow } from './Common.jsx';
import { FieldInput, initialDraft, draftToValue } from './FieldEditor.jsx';
import { ERROR_TEXT } from '../lib/errors.js';

function AddUrl({ status = 'new' }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const run = async () => {
    const urls = text.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setBusy(true);
    const out = [];
    for (const u of urls) {
      const r = await window.atelier.invoke('opp:importUrl', /^https?:\/\//i.test(u) ? u : `https://${u}`, { status });
      out.push({ url: u, ...r });
      setResults([...out]);
    }
    setBusy(false);
    setText('');
  };
  return (
    <Modal title="Add from URL" onClose={closeModal} footer={<><span class="spacer" /><Button onClick={closeModal}>Done</Button><Button kind="primary" icon={Link} onClick={run} disabled={busy || !text.trim()}>{busy ? 'Reading…' : 'Add'}</Button></>}>
      <p class="muted">Paste a link to an open call, residency or grant page (or several, one per line). Atelier reads the page and fills in what it can, marking each detail for you to verify.</p>
      <textarea class="textarea mono" rows={4} value={text} autoFocus placeholder="https://…" onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }} />
      {busy && <Spinner label="Reading the page…" />}
      <ul class="import-results">
        {results.map((r) => (
          <li>
            {r.error ? <TriangleAlert size={14} class="tone-warn" /> : <Check size={14} class="tone-ok" />}
            <span class="mono small">{r.url}</span>
            {r.existed ? <span class="muted"> — already in Atelier</span> : r.error ? <span class="tone-warn"> — added, but {ERROR_TEXT[r.error.kind] || r.error.message} Fill it in by hand or capture it.</span> : <span class="muted"> — {r.fieldsFound} details found</span>}
            {r.id && <button type="button" class="link small" onClick={() => go('opportunity', { id: r.id })}>Open</button>}
            {r.error && <button type="button" class="link small" onClick={() => call('browser:open', r.url, 'Click Capture to read this page into Atelier.')}>Open in Atelier browser</button>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const MANUAL_KEYS = ['name', 'organization', 'type', 'location', 'mode', 'deadline', 'openingDate', 'applicationFee', 'fundingType', 'fundingAmount', 'eligibility', 'discipline', 'applyUrl', 'website'];

function AddManual() {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(MANUAL_KEYS.map((k) => [k, initialDraft(FIELD_BY_KEY[k], null)])));
  const [url, setUrl] = useState('');
  const save = async () => {
    const fields = {};
    for (const k of MANUAL_KEYS) {
      const v = draftToValue(FIELD_BY_KEY[k], drafts[k]);
      if (v.value != null && v.value !== '' && !(Array.isArray(v.value) && !v.value.length)) fields[k] = v;
    }
    if (!fields.name) { toast('Give it a name.', 'error'); return; }
    const opp = await call('opp:create', { fields, url: url.trim(), status: 'saved' });
    if (opp?.id) { closeModal(); go('opportunity', { id: opp.id }); }
  };
  return (
    <Modal title="Add an opportunity by hand" wide onClose={closeModal} footer={<><span class="muted small">Everything you enter is marked “Entered by you”.</span><span class="spacer" /><Button onClick={closeModal}>Cancel</Button><Button kind="primary" icon={Plus} onClick={save}>Add</Button></>}>
      <FormRow label="Page link" hint="Optional; lets Atelier re-check it later"><input class="input" value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://…" /></FormRow>
      {MANUAL_KEYS.map((k) => (
        <FormRow label={FIELD_BY_KEY[k].label}><FieldInput def={FIELD_BY_KEY[k]} draft={drafts[k]} setDraft={(d) => setDrafts({ ...drafts, [k]: d })} autoFocus={k === 'name'} /></FormRow>
      ))}
    </Modal>
  );
}

function SearchWeb() {
  const s = data.value.settings.search || {};
  const [provider, setProvider] = useState(s.provider || 'browser');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [added, setAdded] = useState({});
  useEffect(() => { call('search:suggestions').then((l) => { if (Array.isArray(l)) { setSuggestions(l); if (!query && l[0]) setQuery(l[0]); } }); }, []);
  const known = new Set(data.value.opportunities.map((o) => o.url));
  const run = async () => {
    setBusy(true);
    setRes(null);
    const r = await call('search:run', { query, provider });
    setBusy(false);
    if (r && !r.error && !r.canceled) {
      setRes(r);
      if (r.openUrl) closeModal();
    }
  };
  const add = async (r) => {
    setAdded({ ...added, [r.url]: 'adding' });
    const out = await window.atelier.invoke('opp:importUrl', r.url, { status: 'new' });
    setAdded({ ...added, [r.url]: out?.error ? 'error' : 'added' });
  };
  const aiReady = meta.value.ai?.provider === 'anthropic';
  return (
    <Modal title="Search beyond your sources" wide onClose={closeModal} footer={<><span class="spacer" /><Button onClick={closeModal}>Close</Button></>}>
      <div class="inline-fields">
        <input class="input grow" value={query} autoFocus onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder="e.g. sound art residency open call 2027" />
        <Select value={provider} onChange={setProvider} options={[
          { value: 'browser', label: 'In the Atelier browser' },
          { value: 'brave', label: `Brave Search${meta.value.secrets?.brave ? '' : ' (add key in Settings)'}`, disabled: !meta.value.secrets?.brave },
          { value: 'claude', label: `Claude web search${aiReady ? '' : ' (needs Claude in Settings › AI)'}`, disabled: !aiReady },
        ]} />
        <Button kind="primary" icon={SearchIcon} onClick={run} disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</Button>
      </div>
      <div class="chips">{suggestions.map((q) => <button type="button" class="chip clickable" onClick={() => setQuery(q)}>{q}</button>)}</div>
      {provider === 'browser' && <p class="muted small">Opens the search in the Atelier browser. Open a promising result and click <b>Capture</b> to add it to Discover.</p>}
      {busy && <Spinner label={provider === 'claude' ? 'Claude is searching the web (this can take a minute)…' : 'Searching…'} />}
      {res && (
        <ul class="search-results">
          {res.results.map((r) => (
            <li>
              <div><b>{r.title}</b> <span class="muted small mono">{r.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}</span></div>
              {r.snippet && <div class="small">{r.snippet}</div>}
              {r.why && <div class="small muted">{r.why}</div>}
              <div class="inline-fields">
                {known.has(r.url) ? <span class="muted small">Already in Atelier</span> : added[r.url] === 'added' ? <span class="tone-ok small"><Check size={12} /> Added to Discover</span> : added[r.url] === 'error' ? <span class="tone-warn small">Added, but the page couldn’t be read</span> :
                  <Button small icon={Plus} disabled={added[r.url] === 'adding'} onClick={() => add(r)}>{added[r.url] === 'adding' ? 'Reading…' : 'Add to Discover'}</Button>}
                <Button small kind="ghost" icon={ExternalLink} onClick={() => call('shell:open', r.url)}>Open</Button>
              </div>
            </li>
          ))}
          {!res.results.length && <li class="muted">No results.</li>}
        </ul>
      )}
      {res?.provider === 'claude' && <p class="muted small">Results from Claude’s web search. Each one is read and checked like any other page when you add it.</p>}
    </Modal>
  );
}

const GUIDE = [
  { key: 'title', label: 'Working title', prompts: ['What do you call this project for now?'] },
  { key: 'summary', label: 'Summary', prompts: ['In one or two sentences: what will you make, research or develop?', 'If someone reads only this, what should they remember?'] },
  { key: 'description', label: 'Project description', prompts: ['What is the project, concretely?', 'Why this project, and why now?', 'How does it grow out of your previous work?', 'What questions are you exploring?'] },
  { key: 'residencyUse', label: 'Planned use of residency time', prompts: ['What will you do day to day or week to week?', 'What will you make, test, record or research while there?', 'Why does this need time away, or this kind of place?', 'Who would you like to meet or work with?'] },
  { key: 'timeline', label: 'Timeline / work plan', prompts: ['Break the time into phases or weeks.', 'What milestone ends each phase?'] },
  { key: 'outcomes', label: 'Outcomes and sharing', prompts: ['What will exist at the end?', 'Would you share it — open studio, talk, workshop, performance, recording?'] },
  { key: 'specialRequirements', label: 'Special requirements', prompts: ['Space: size, quiet, sound isolation, light, floor?', 'Equipment or technical needs (amplification, recording gear, power, internet)?', 'Accessibility, family, dietary or schedule needs?', 'Dates you can or can’t do?'] },
  { key: 'budget', label: 'Budget (optional)', prompts: ['Materials, equipment rental, travel, fees for collaborators.'] },
];

function GuidedProposal({ attachTo }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState({});
  const g = GUIDE[step];
  const last = step === GUIDE.length - 1;
  const create = async () => {
    const p = await call('col:create', 'proposals', { title: title.trim() || 'Untitled proposal', sections, tags: [], versions: [] });
    if (!p?.id) return;
    if (attachTo?.appId) {
      await call('writing:createTailored', { proposalId: p.id, oppId: attachTo.oppId, appId: attachTo.appId });
      toast('Proposal saved, and a tailored copy attached to this application.', 'success');
      closeModal();
    } else {
      closeModal();
      go('writing', { proposalId: p.id });
    }
  };
  return (
    <Modal title="New proposal" wide onClose={closeModal} class="guided" footer={<>
      <span class="muted small">Step {step + 1} of {GUIDE.length}: {g.label}</span><span class="spacer" />
      <Button icon={ChevronLeft} disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
      {!last && <Button kind="primary" onClick={() => setStep(step + 1)}>Next <ChevronRight size={14} /></Button>}
      {last && <Button kind="primary" icon={Check} onClick={create}>Create proposal</Button>}
    </>}>
      <div class="guide-steps">{GUIDE.map((x, i) => <button type="button" class={`gs${i === step ? ' active' : ''}${(x.key === 'title' ? title : sections[x.key]) ? ' done' : ''}`} onClick={() => setStep(i)}>{x.label}</button>)}</div>
      <h3>{g.label}</h3>
      <ul class="prompts">{g.prompts.map((p) => <li>{p}</li>)}</ul>
      {g.key === 'title'
        ? <input class="input" value={title} autoFocus onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. Listening Lattice" />
        : (
          <>
            <textarea class="textarea" rows={10} value={sections[g.key] || ''} autoFocus onInput={(e) => setSections({ ...sections, [g.key]: e.currentTarget.value })} />
            <div class="muted small">{wordCount(sections[g.key])} words · {PROPOSAL_SECTIONS.find((s) => s.key === g.key)?.hint}</div>
          </>
        )}
      <p class="muted small">Write freely; you can skip any step and edit everything later. Tailoring for a specific opportunity happens on a copy.</p>
    </Modal>
  );
}

export function ModalHost() {
  const m = modal.value;
  if (!m) return null;
  switch (m.type) {
    case 'addUrl': return <AddUrl {...m.props} />;
    case 'addManual': return <AddManual {...m.props} />;
    case 'search': return <SearchWeb {...m.props} />;
    case 'guidedProposal': return <GuidedProposal {...m.props} />;
    default: return null;
  }
}
