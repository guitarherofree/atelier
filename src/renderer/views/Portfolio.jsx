// Portfolio library: work samples with captions, project details, files and links.
import { useState, useEffect } from 'preact/hooks';
import { Image, Plus, Trash2, ExternalLink, FolderOpen, X, Link2, Video, Music, FileText, File, TriangleAlert } from 'lucide-preact';
import { data, call, confirmDialog, toast } from '../lib/store.js';
import { Button, IconButton, Empty, Select, TextInput, TextArea, TagInput, Tabs, FormRow } from '../components/Common.jsx';
import { bytes } from '../lib/format.js';

const KIND_ICON = { video: Video, audio: Music, pdf: FileText, doc: FileText, other: File };

function Thumb({ item }) {
  const f = item.files?.[0];
  const [failed, setFailed] = useState(false);
  if (f && !failed && (f.kind === 'image' || f.thumb)) return <img src={`atelier-thumb://thumb/${f.id}`} alt="" loading="lazy" onError={() => setFailed(true)} />;
  const Icon = f ? KIND_ICON[f.kind] || File : item.links?.length ? Link2 : Image;
  return <div class="thumb-icon"><Icon size={28} strokeWidth={1.3} /></div>;
}

function ItemEditor({ item, onClose, missing }) {
  const projects = data.value.projects;
  const allTags = [...new Set(data.value.portfolio.flatMap((p) => p.tags || []))];
  const upd = (patch) => call('col:update', 'portfolio', item.id, patch);
  const usedIn = data.value.applications.filter((a) => (a.samples || []).some((s) => s.itemId === item.id)).length;
  return (
    <aside class="drawer">
      <div class="drawer-head"><h3>{item.title || 'Untitled'}</h3><IconButton icon={X} label="Close" onClick={onClose} /></div>
      <div class="drawer-body">
        <div class="form-grid">
          <label>Title</label><TextInput value={item.title} onSave={(v) => upd({ title: v })} />
          <label>Year</label><TextInput value={item.year} onSave={(v) => upd({ year: v })} placeholder="2025" />
          <label>Medium</label><TextInput value={item.medium} onSave={(v) => upd({ medium: v })} placeholder="e.g. Electric guitar, tape loops, field recordings" />
          <label>Size / duration</label><TextInput value={item.dimensions} onSave={(v) => upd({ dimensions: v })} placeholder="e.g. 12:30, or 120 × 90 cm" />
          <label>Project</label>
          <Select value={item.projectId || ''} onChange={(v) => upd({ projectId: v || null })} options={[{ value: '', label: 'None' }, ...projects.map((p) => ({ value: p.id, label: p.title }))]} />
          <label>Credits</label><TextInput value={item.credits} onSave={(v) => upd({ credits: v })} placeholder="Collaborators, photographer…" />
        </div>
        <label class="label">Caption</label>
        <TextArea value={item.caption} rows={2} onSave={(v) => upd({ caption: v })} hint="Short line used in application sample lists" />
        <label class="label">Description</label>
        <TextArea value={item.description} rows={5} onSave={(v) => upd({ description: v })} />
        <label class="label">Tags</label>
        <TagInput value={item.tags || []} onChange={(tags) => upd({ tags })} suggestions={allTags} />
        <label class="label">Links</label>
        {(item.links || []).map((l, i) => (
          <div class="custom-row">
            <input class="input" value={l.label} placeholder="Label (Vimeo, SoundCloud…)" onChange={(e) => upd({ links: item.links.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)) })} />
            <input class="input" value={l.url} placeholder="https://…" onChange={(e) => upd({ links: item.links.map((x, j) => (j === i ? { ...x, url: e.currentTarget.value } : x)) })} />
            <IconButton icon={ExternalLink} label="Open" onClick={() => call('shell:open', l.url)} />
            <IconButton icon={X} label="Remove" onClick={() => upd({ links: item.links.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <Button small icon={Plus} onClick={() => upd({ links: [...(item.links || []), { label: '', url: '' }] })}>Add link</Button>
        <label class="label">Files</label>
        <ul class="file-list">
          {(item.files || []).map((f) => (
            <li>
              <span>{f.name}</span><span class="muted small">{bytes(f.size)}{f.linked ? ' · linked in place' : ''}</span>
              {missing[f.id]?.missing && <span class="tone-bad small"><TriangleAlert size={12} /> missing</span>}
              <span class="spacer" />
              <IconButton icon={ExternalLink} label="Open" onClick={() => call('file:open', f.id)} />
              <IconButton icon={FolderOpen} label="Show in Finder" onClick={() => call('file:reveal', f.id)} />
              <IconButton icon={X} label="Remove file" onClick={async () => { if (await confirmDialog(`Remove “${f.name}” from this work?`, f.linked ? 'The original file is not touched.' : 'Atelier’s copy will be deleted. The file you imported from is not touched.', { confirmLabel: 'Remove', destructive: true })) call('portfolio:removeFile', item.id, f.id); }} />
            </li>
          ))}
        </ul>
        <Button small icon={Plus} onClick={() => call('portfolio:addFiles', item.id)}>Add files</Button>
        <p class="muted small">{usedIn ? `Selected in ${usedIn} application${usedIn === 1 ? '' : 's'}.` : 'Not used in any application yet.'}</p>
        <Button small kind="danger" icon={Trash2} onClick={async () => { if (await confirmDialog(`Delete “${item.title}” from your portfolio?`, 'Atelier’s copies of its files are deleted too. Originals elsewhere on your Mac are not touched.', { confirmLabel: 'Delete', destructive: true })) { await call('col:delete', 'portfolio', item.id); onClose(); } }}>Delete work</Button>
      </div>
    </aside>
  );
}

function Projects() {
  const projects = data.value.projects;
  const [sel, setSel] = useState(projects[0]?.id || null);
  const p = projects.find((x) => x.id === sel);
  const count = (id) => data.value.portfolio.filter((it) => it.projectId === id).length;
  return (
    <div class="two-col list-editor">
      <div>
        <ul class="simple-list">
          {projects.map((x) => <li class={x.id === sel ? 'active' : ''}><button type="button" onClick={() => setSel(x.id)}><b>{x.title}</b><span class="muted small">{x.years} · {count(x.id)} works</span></button></li>)}
        </ul>
        <Button icon={Plus} onClick={async () => { const n = await call('col:create', 'projects', { title: 'New project', years: '', description: '', links: [] }); setSel(n.id); }}>New project</Button>
      </div>
      {p ? (
        <div>
          <div class="form-grid">
            <label>Title</label><TextInput value={p.title} onSave={(v) => call('col:update', 'projects', p.id, { title: v })} />
            <label>Years</label><TextInput value={p.years} onSave={(v) => call('col:update', 'projects', p.id, { years: v })} placeholder="2024–2026" />
          </div>
          <label class="label">About the project</label>
          <TextArea value={p.description} rows={8} onSave={(v) => call('col:update', 'projects', p.id, { description: v })} />
          <Button small kind="danger" icon={Trash2} onClick={async () => { if (await confirmDialog(`Delete the project “${p.title}”?`, 'Its works stay in your portfolio.', { confirmLabel: 'Delete', destructive: true })) { await call('col:delete', 'projects', p.id); setSel(null); } }}>Delete project</Button>
        </div>
      ) : <Empty title="No project selected"><p>Projects group related works and hold the background you reuse in proposals.</p></Empty>}
    </div>
  );
}

export function Portfolio() {
  const [tab, setTab] = useState('works');
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const [drag, setDrag] = useState(false);
  const [missing, setMissing] = useState({});
  const items = data.value.portfolio;
  useEffect(() => { call('portfolio:fileStatus').then((m) => setMissing(m || {})); }, [items.length]);
  let list = items;
  if (project) list = list.filter((i) => i.projectId === project);
  if (q.trim()) { const n = q.toLowerCase(); list = list.filter((i) => `${i.title} ${i.medium} ${i.caption} ${(i.tags || []).join(' ')}`.toLowerCase().includes(n)); }
  const item = items.find((i) => i.id === sel);
  const onDrop = async (e) => {
    e.preventDefault();
    setDrag(false);
    const paths = [...(e.dataTransfer?.files || [])].map((f) => window.atelier.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    const r = await call('portfolio:addPaths', null, paths);
    if (Array.isArray(r)) toast(`Added ${r.length} work${r.length === 1 ? '' : 's'}`, 'success');
  };
  return (
    <div class={`page page-wide${item ? ' with-drawer' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }} onDrop={onDrop}>
      <header class="page-head">
        <div><h1>Portfolio</h1><p class="page-sub">Your work samples, captions and project details. Drop files anywhere here to add them.</p></div>
        <div class="page-actions">
          <Button icon={Link2} onClick={async () => { const n = await call('col:create', 'portfolio', { title: 'New work', year: '', medium: '', dimensions: '', caption: '', description: '', projectId: null, tags: [], links: [{ label: '', url: '' }], credits: '', files: [] }); setSel(n.id); }}>Add a link-only work</Button>
          <Button kind="primary" icon={Plus} onClick={() => call('portfolio:addFiles', null)}>Add work…</Button>
        </div>
      </header>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'works', label: 'Works', count: items.length }, { key: 'projects', label: 'Projects', count: data.value.projects.length }]} />
      {tab === 'works' ? (
        <>
          <div class="filters">
            <input class="input search" placeholder="Filter…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
            {data.value.projects.length > 0 && <Select value={project} onChange={setProject} options={[{ value: '', label: 'All projects' }, ...data.value.projects.map((p) => ({ value: p.id, label: p.title }))]} />}
          </div>
          {list.length ? (
            <div class="pf-grid">
              {list.map((it) => (
                <button type="button" class={`pf-card${sel === it.id ? ' active' : ''}`} onClick={() => setSel(it.id)}>
                  <div class="pf-thumb"><Thumb item={it} /></div>
                  <div class="pf-meta"><div class="pf-title">{it.title}</div><div class="muted small">{[it.year, it.medium].filter(Boolean).join(' · ')}</div></div>
                  {(it.files || []).some((f) => missing[f.id]?.missing) && <span class="pf-warn" title="A file is missing"><TriangleAlert size={13} /></span>}
                </button>
              ))}
            </div>
          ) : <Empty icon={Image} title={items.length ? 'Nothing matches' : 'No work samples yet'}><p>Click <b>Add work…</b> or drop images, video, audio or PDFs here. Atelier keeps its own copies, so moving the originals won’t break anything.</p></Empty>}
        </>
      ) : <Projects />}
      {drag && <div class="drop-overlay">Drop to add to your portfolio</div>}
      {item && tab === 'works' && <ItemEditor item={item} missing={missing} onClose={() => setSel(null)} />}
    </div>
  );
}
