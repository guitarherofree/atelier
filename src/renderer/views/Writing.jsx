// Reusable project proposals and application text.
import { useState } from 'preact/hooks';
import { diffWords } from 'diff';
import { PenLine, Plus, Copy, Trash2, History, CornerDownRight, Sparkles } from 'lucide-preact';
import { data, call, go, openModal, confirmDialog, route, toast } from '../lib/store.js';
import { PROPOSAL_SECTIONS, SNIPPET_KINDS, wordCount } from '../../shared/schema.mjs';
import { Button, Empty, Tabs, TextInput, TextArea, TagInput, Select, Toggle, Badge } from '../components/Common.jsx';
import { fmtDate } from '../lib/format.js';

function Diff({ a, b }) {
  return <div class="diff">{diffWords(a || '', b || '').map((p) => (p.added ? <ins>{p.value}</ins> : p.removed ? <del>{p.value}</del> : <span>{p.value}</span>))}</div>;
}

function ProposalEditor({ p }) {
  const [diff, setDiff] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const upd = (patch) => call('col:update', 'proposals', p.id, patch);
  const setSection = (k, t) => upd({ sections: { ...p.sections, [k]: t } });
  const usedBy = data.value.applications.filter((a) => a.proposalId === p.id);
  const original = p.tailoredFrom ? data.value.proposals.find((x) => x.id === p.tailoredFrom.proposalId) : null;
  const total = PROPOSAL_SECTIONS.reduce((n, s) => n + wordCount(p.sections?.[s.key]), 0);
  const saveVersion = () => upd({ versions: [{ at: new Date().toISOString(), title: p.title, sections: p.sections }, ...(p.versions || [])].slice(0, 25) });
  return (
    <div class="prop-editor">
      <div class="prop-editor-head">
        <TextInput value={p.title} onSave={(v) => upd({ title: v })} class="title-input" />
        <div class="inline-fields">
          <span class="muted small">{total} words</span>
          <Button small icon={History} onClick={() => setShowVersions(!showVersions)}>Versions ({(p.versions || []).length})</Button>
          <Button small icon={Copy} onClick={async () => { const n = await call('col:create', 'proposals', { title: `${p.title} (copy)`, sections: { ...p.sections }, tags: p.tags || [], versions: [] }); go('writing', { proposalId: n.id }); }}>Duplicate</Button>
          <Button small kind="danger" icon={Trash2} onClick={async () => {
            if (await confirmDialog(`Delete “${p.title}”?`, usedBy.length ? `It’s used by ${usedBy.length} application(s); they will no longer have a proposal attached.` : '', { confirmLabel: 'Delete', destructive: true })) {
              for (const a of usedBy) await call('app:update', a.id, { proposalId: null });
              await call('col:delete', 'proposals', p.id);
              go('writing', {});
            }
          }}>Delete</Button>
        </div>
      </div>
      {p.tailoredFrom && (
        <div class="banner tone-plain">
          <span>Tailored copy of <b>{p.tailoredFrom.title}</b>{p.tailoredFor ? <> for <button type="button" class="link" onClick={() => go('opportunity', { id: p.tailoredFor.oppId })}>{p.tailoredFor.name}</button></> : ''}. The original is unchanged.</span>
          <div class="banner-actions">
            <Toggle checked={diff} onChange={setDiff} label="Show changes" />
            {original && <Button small kind="ghost" onClick={() => go('writing', { proposalId: original.id })}>Open original</Button>}
          </div>
        </div>
      )}
      {usedBy.length > 0 && <p class="muted small">Used by {usedBy.length} application{usedBy.length === 1 ? '' : 's'}.</p>}
      <label class="label">Tags</label>
      <TagInput value={p.tags || []} onChange={(tags) => upd({ tags })} />
      {showVersions && (
        <div class="versions">
          <Button small onClick={saveVersion}>Save the current text as a version</Button>
          <ul>
            {(p.versions || []).map((v, i) => (
              <li><span>{fmtDate(v.at, { dateStyle: 'medium', timeStyle: 'short' })}</span> <span class="muted small">{PROPOSAL_SECTIONS.reduce((n, s) => n + wordCount(v.sections?.[s.key]), 0)} words</span>
                <button type="button" class="link small" onClick={async () => { if (await confirmDialog('Restore this version?', 'The current text is saved as a version first.', { confirmLabel: 'Restore' })) { await upd({ versions: [{ at: new Date().toISOString(), title: p.title, sections: p.sections }, ...(p.versions || []).filter((_, j) => j !== i)].slice(0, 25), sections: v.sections }); toast('Version restored', 'success'); } }}>Restore</button></li>
            ))}
            {!(p.versions || []).length && <li class="muted small">No saved versions yet.</li>}
          </ul>
        </div>
      )}
      {PROPOSAL_SECTIONS.map((s) => (
        <div class="prop-section">
          <div class="prop-section-head"><h4>{s.label}</h4><span class="muted small">{s.hint}</span></div>
          {diff && p.tailoredFrom ? <Diff a={p.tailoredFrom.originalSections?.[s.key]} b={p.sections?.[s.key]} /> : <TextArea value={p.sections?.[s.key] || ''} rows={s.key === 'summary' ? 2 : 6} onSave={(t) => setSection(s.key, t)} />}
        </div>
      ))}
    </div>
  );
}

function Proposals() {
  const props = data.value.proposals;
  const sel = route.value.proposalId && props.find((p) => p.id === route.value.proposalId) ? route.value.proposalId : props.find((p) => !p.tailoredFrom)?.id || props[0]?.id;
  const p = props.find((x) => x.id === sel);
  const originals = props.filter((x) => !x.tailoredFrom || !props.some((y) => y.id === x.tailoredFrom.proposalId));
  return (
    <div class="two-col list-editor">
      <div>
        <div class="inline-fields">
          <Button kind="primary" icon={Sparkles} onClick={() => openModal('guidedProposal')}>New proposal (guided)</Button>
          <Button icon={Plus} onClick={async () => { const n = await call('col:create', 'proposals', { title: 'Untitled proposal', sections: {}, tags: [], versions: [] }); go('writing', { proposalId: n.id }); }}>Blank</Button>
        </div>
        <ul class="simple-list">
          {originals.map((o) => (
            <>
              <li class={o.id === sel ? 'active' : ''}><button type="button" onClick={() => go('writing', { proposalId: o.id })}><b>{o.title}</b><span class="muted small">{PROPOSAL_SECTIONS.reduce((n, s) => n + wordCount(o.sections?.[s.key]), 0)} words · edited {fmtDate(o.updatedAt, { month: 'short', day: 'numeric' })}</span></button></li>
              {props.filter((t) => t.tailoredFrom?.proposalId === o.id).map((t) => (
                <li class={`child${t.id === sel ? ' active' : ''}`}><button type="button" onClick={() => go('writing', { proposalId: t.id })}><CornerDownRight size={12} /> <span>{t.tailoredFor?.name || t.title}</span></button></li>
              ))}
            </>
          ))}
        </ul>
      </div>
      {p ? <ProposalEditor key={p.id} p={p} /> : <Empty icon={PenLine} title="No proposals yet"><p>Start with the guided form: it walks you through the project description, how you’d use residency time, and special requirements.</p></Empty>}
    </div>
  );
}

function SavedText() {
  const list = data.value.snippets;
  const [sel, setSel] = useState(list[0]?.id || null);
  const [kind, setKind] = useState('');
  const s = list.find((x) => x.id === sel);
  const shown = kind ? list.filter((x) => x.kind === kind) : list;
  const usedIn = s ? data.value.applications.filter((a) => (a.materials || []).some((m) => m.snippetId === s.id)).length : 0;
  return (
    <div class="two-col list-editor">
      <div>
        <div class="inline-fields">
          <Select value="" onChange={async (k) => { if (!k) return; const n = await call('col:create', 'snippets', { title: SNIPPET_KINDS.find((x) => x.key === k).label, kind: k, text: '', tags: [] }); setSel(n.id); }}
            options={[{ value: '', label: '+ New saved text…' }, ...SNIPPET_KINDS.map((k) => ({ value: k.key, label: k.label }))]} />
          <Select value={kind} onChange={setKind} options={[{ value: '', label: 'All kinds' }, ...SNIPPET_KINDS.map((k) => ({ value: k.key, label: k.label }))]} />
        </div>
        <ul class="simple-list">
          {shown.map((x) => <li class={x.id === sel ? 'active' : ''}><button type="button" onClick={() => setSel(x.id)}><b>{x.title}</b><span class="muted small">{SNIPPET_KINDS.find((k) => k.key === x.kind)?.label} · {wordCount(x.text)} words</span></button></li>)}
        </ul>
      </div>
      {s ? (
        <div>
          <div class="form-grid">
            <label>Title</label><TextInput value={s.title} onSave={(v) => call('col:update', 'snippets', s.id, { title: v })} />
            <label>Kind</label><Select value={s.kind} onChange={(v) => call('col:update', 'snippets', s.id, { kind: v })} options={SNIPPET_KINDS.map((k) => ({ value: k.key, label: k.label }))} />
          </div>
          <label class="label">Text</label>
          <TextArea value={s.text} rows={14} onSave={(v) => call('col:update', 'snippets', s.id, { text: v })} />
          <label class="label">Tags</label>
          <TagInput value={s.tags || []} onChange={(tags) => call('col:update', 'snippets', s.id, { tags })} />
          <p class="muted small">{usedIn ? `Used as a material in ${usedIn} application${usedIn === 1 ? '' : 's'}.` : 'Insert it into answers, or link it to a material in an application.'}</p>
          <Button small kind="danger" icon={Trash2} onClick={async () => { if (await confirmDialog(`Delete “${s.title}”?`, '', { confirmLabel: 'Delete', destructive: true })) { await call('col:delete', 'snippets', s.id); setSel(null); } }}>Delete</Button>
        </div>
      ) : <Empty icon={PenLine} title="No saved text yet"><p>Keep bios (short and long), artist statements, CV text and answers you reuse.</p></Empty>}
    </div>
  );
}

export function Writing() {
  const tab = route.value.wtab || 'proposals';
  return (
    <div class="page page-wide">
      <header class="page-head"><div><h1>Proposals & Text</h1><p class="page-sub">Reusable proposals and application text. Tailored copies for each opportunity sit under their original.</p></div></header>
      <Tabs value={tab} onChange={(t) => go('writing', { wtab: t })} tabs={[{ key: 'proposals', label: 'Proposals', count: data.value.proposals.length }, { key: 'text', label: 'Saved text', count: data.value.snippets.length }]} />
      {tab === 'proposals' ? <Proposals /> : <SavedText />}
    </div>
  );
}
