// Where Atelier looks for opportunities. Every source can be edited, tested, turned off or removed.
import { useState } from 'preact/hooks';
import { Plus, RefreshCw, Pencil, LogIn, ExternalLink, FlaskConical, Trash2, TriangleAlert, Check, Hash, RotateCcw } from 'lucide-preact';
import { data, call, discovery, go, confirmDialog, toast } from '../lib/store.js';
import { OPP_TYPES } from '../../shared/schema.mjs';
import { Button, IconButton, Toggle, Modal, Select, Spinner, Badge, FormRow } from '../components/Common.jsx';
import { ERROR_TEXT } from '../lib/errors.js';
import { ago } from '../lib/format.js';

const BLANK = {
  name: '', homepage: '', kind: 'listing', listingUrls: [], linkPattern: '', excludePattern: '', pagination: null, followNext: true, maxPages: 2,
  render: 'auto', aggregator: true, defaultType: '', notes: '', enabled: true,
};

function TestResults({ result }) {
  if (!result) return null;
  if (result.error) return <p class="tone-bad">{result.error}</p>;
  return (
    <div class="test-results">
      <p>
        Read {result.pages} page{result.pages === 1 ? '' : 's'} and found <b>{result.count}</b> opportunity link{result.count === 1 ? '' : 's'}.
        {result.learnedPattern && <> No links matched the pattern, so Atelier learned one: <code>{result.learnedPattern}</code></>}
      </p>
      {result.errors?.map((e) => <p class="tone-warn small"><TriangleAlert size={12} /> {e.url}: {ERROR_TEXT[e.kind] || e.message}</p>)}
      {result.links?.length > 0 && <ul class="test-links">{result.links.slice(0, 25).map((l) => <li><span class="mono small">{l.url.replace(/^https?:\/\/(www\.)?/, '')}</span> {l.text && <span class="muted"> — {l.text.slice(0, 80)}</span>}</li>)}</ul>}
      {result.sample && (
        <div class="test-sample">
          <h4>What Atelier read from the first one</h4>
          {result.sample.error ? <p class="tone-warn">{result.sample.error}</p> : (
            <table class="mini-table"><tbody>{Object.entries(result.sample.fields).map(([k, v]) => <tr><td>{k}</td><td>{typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value).slice(0, 140)}</td><td class="muted small">{v.method} · {Math.round(v.confidence * 100)}%</td></tr>)}</tbody></table>
          )}
        </div>
      )}
    </div>
  );
}

function SourceEditor({ source, onClose }) {
  const [s, setS] = useState(() => ({ ...BLANK, ...source, listingText: (source?.listingUrls || []).join('\n') }));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k, v) => setS({ ...s, [k]: v });
  const toSource = () => {
    const { listingText, ...rest } = s;
    const urls = listingText.split('\n').map((l) => l.trim()).filter(Boolean);
    return { ...rest, listingUrls: urls, homepage: rest.homepage || urls[0] || '' };
  };
  const test = async () => {
    setTesting(true);
    setResult(null);
    const r = await window.atelier.invoke('sources:test', toSource());
    setTesting(false);
    setResult(r);
  };
  const save = async () => {
    const src = toSource();
    if (!src.name.trim() || !src.listingUrls.length) { toast('Give the source a name and at least one page to read.', 'error'); return; }
    if (source?.id) await call('col:update', 'sources', source.id, src);
    else await call('col:create', 'sources', src);
    onClose();
  };
  return (
    <Modal title={source?.id ? `Edit ${source.name}` : 'Add a source'} onClose={onClose} wide footer={<>
      <Button icon={FlaskConical} onClick={test} disabled={testing}>{testing ? 'Testing…' : 'Test'}</Button>
      {result?.learnedPattern && <Button onClick={() => set('linkPattern', result.learnedPattern)}>Use learned pattern</Button>}
      <span class="spacer" />
      <Button onClick={onClose}>Cancel</Button>
      <Button kind="primary" onClick={save}>Save</Button>
    </>}>
      <FormRow label="Name"><input class="input" value={s.name} onInput={(e) => set('name', e.currentTarget.value)} /></FormRow>
      <FormRow label="Pages to read" hint="One URL per line: listing pages, RSS or Atom feeds">
        <textarea class="textarea mono" rows={3} value={s.listingText} onInput={(e) => set('listingText', e.currentTarget.value)} placeholder="https://example.org/open-calls" />
      </FormRow>
      <FormRow label="Kind">
        <Select value={s.kind} onChange={(v) => set('kind', v)} options={[{ value: 'listing', label: 'Listing of open calls' }, { value: 'feed', label: 'RSS / Atom feed' }, { value: 'directory', label: 'Directory of residencies (no deadlines)' }]} />
      </FormRow>
      <FormRow label="Opportunity links" hint="Optional regular expression for link paths. Leave blank and Atelier learns it.">
        <input class="input mono" value={s.linkPattern} onInput={(e) => set('linkPattern', e.currentTarget.value)} placeholder="/open-call/[^/]+/?$" />
      </FormRow>
      <FormRow label="Ignore links" hint="Optional regular expression"><input class="input mono" value={s.excludePattern} onInput={(e) => set('excludePattern', e.currentTarget.value)} /></FormRow>
      <FormRow label="More pages">
        <div class="inline-fields">
          <label class="check"><input type="checkbox" checked={s.followNext !== false} onChange={(e) => set('followNext', e.currentTarget.checked)} /> Follow “next page” links</label>
          <span class="muted small">up to</span>
          <input class="input input-num" type="number" min="1" max="10" value={s.maxPages} onInput={(e) => set('maxPages', Number(e.currentTarget.value) || 1)} />
          <span class="muted small">pages</span>
        </div>
      </FormRow>
      <FormRow label="Page numbers" hint="Optional: a URL with {page}, e.g. https://site.org/calls/{page}">
        <div class="inline-fields">
          <input class="input mono" value={s.pagination?.template || ''} onInput={(e) => set('pagination', e.currentTarget.value ? { from: 2, to: 3, ...(s.pagination || {}), template: e.currentTarget.value } : null)} />
          {s.pagination?.template && <><span class="muted small">pages</span><input class="input input-num" type="number" value={s.pagination.from} onInput={(e) => set('pagination', { ...s.pagination, from: Number(e.currentTarget.value) })} /><span class="muted small">to</span><input class="input input-num" type="number" value={s.pagination.to} onInput={(e) => set('pagination', { ...s.pagination, to: Number(e.currentTarget.value) })} /></>}
        </div>
      </FormRow>
      <FormRow label="JavaScript" hint="Some sites draw their listings with JavaScript">
        <Select value={s.render} onChange={(v) => set('render', v)} options={[{ value: 'auto', label: 'Automatic (when a page looks empty)' }, { value: 'always', label: 'Always load like a browser (slower)' }, { value: 'never', label: 'Never' }]} />
      </FormRow>
      <FormRow label="Default type"><Select value={s.defaultType} onChange={(v) => set('defaultType', v)} options={[{ value: '', label: 'Detect from each page' }, ...OPP_TYPES]} /></FormRow>
      <FormRow label="Notes"><textarea class="textarea" rows={2} value={s.notes} onInput={(e) => set('notes', e.currentTarget.value)} /></FormRow>
      {testing && <Spinner label="Reading the source…" />}
      <TestResults result={result} />
    </Modal>
  );
}

function RunSummary({ s }) {
  const r = s.lastRun;
  if (!r) return <span class="muted small">Not run yet</span>;
  const problem = r.status && !['ok', 'manual'].includes(r.status);
  return (
    <div class="run-summary">
      <span class="small">{problem ? <TriangleAlert size={12} class="tone-warn" /> : <Check size={12} class="tone-ok" />} Checked {ago(r.at)} · {r.found ?? 0} found · {r.added ?? 0} new{r.alsoListed ? ` · ${r.alsoListed} also listed elsewhere` : ''}{r.pending ? ` · ${r.pending} waiting for the next run` : ''}</span>
      {problem && <div class="tone-warn small">{ERROR_TEXT[r.status] || r.errors?.[0]?.message}</div>}
      {r.message && <div class="muted small">{r.message}</div>}
      {r.learnedPattern && !s.linkPattern && <div class="small">Learned link pattern <code>{r.learnedPattern}</code> <button type="button" class="link small" onClick={() => call('col:update', 'sources', s.id, { linkPattern: r.learnedPattern })}>Keep it</button></div>}
      {r.learnedPattern && s.linkPattern && <div class="tone-warn small">The saved pattern found nothing; Atelier used <code>{r.learnedPattern}</code> instead. <button type="button" class="link small" onClick={() => call('col:update', 'sources', s.id, { linkPattern: r.learnedPattern })}>Replace the pattern</button></div>}
    </div>
  );
}

export function Sources() {
  const [editing, setEditing] = useState(null);
  const sources = data.value.sources;
  const ig = data.value.settings.instagram || {};
  const running = discovery.value.running;
  return (
    <div class="page">
      <header class="page-head">
        <div><h1>Sources</h1><p class="page-sub">Websites Atelier reads for new opportunities. It only reads public pages (and pages you can see when signed in through the Atelier browser), at a polite pace.</p></div>
        <div class="page-actions">
          <Button icon={RotateCcw} onClick={async () => { const r = await call('sources:restoreDefaults'); toast(r?.added ? `Restored ${r.added} built-in source(s)` : 'All built-in sources are already here'); }}>Restore built-ins</Button>
          <Button kind="primary" icon={Plus} onClick={() => setEditing({})}>Add source</Button>
        </div>
      </header>
      <div class="source-list">
        {sources.map((s) => (
          <div class={`source${s.enabled ? '' : ' disabled'}`}>
            <div class="source-main">
              <div class="source-title">
                <Toggle checked={s.enabled} onChange={(v) => call('col:update', 'sources', s.id, { enabled: v })} />
                <h3>{s.name}</h3>
                {s.kind !== 'listing' && <Badge tone="soft">{s.kind === 'instagram' ? 'Instagram' : s.kind === 'feed' ? 'Feed' : 'Directory'}</Badge>}
                {s.builtInKey && <Badge tone="muted">Built in</Badge>}
              </div>
              {s.kind === 'instagram' ? (
                <div class="small">
                  <p class="muted">{s.notes}</p>
                  <p>Mode: <b>{ig.mode === 'graph' ? 'Graph API' : ig.mode === 'browser' ? 'Browse and capture' : 'Off'}</b> · <button type="button" class="link small" onClick={() => go('settings', { section: 'instagram' })}>Change in Settings</button></p>
                </div>
              ) : (
                <>
                  <div class="muted small mono">{(s.listingUrls || []).join('  ·  ')}</div>
                  {s.notes && <p class="muted small">{s.notes}</p>}
                  <RunSummary s={s} />
                </>
              )}
            </div>
            <div class="source-actions">
              {s.kind === 'instagram' ? (
                <>
                  {ig.mode !== 'off' && <Button small icon={Hash} onClick={() => call('instagram:browse')}>Browse #{(ig.hashtags || ['artistresidency'])[0]}</Button>}
                  {ig.mode === 'graph' && <Button small icon={RefreshCw} disabled={running} onClick={() => call('discovery:run', [s.id])}>Fetch</Button>}
                </>
              ) : (
                <>
                  <Button small icon={RefreshCw} disabled={running} onClick={() => call('discovery:run', [s.id])}>Run</Button>
                  <IconButton icon={Pencil} label="Edit and test" onClick={() => setEditing(s)} />
                  <IconButton icon={LogIn} label="Sign in (in the Atelier browser)" onClick={() => call('sources:signIn', s.id)} />
                  <IconButton icon={ExternalLink} label="Open the site" onClick={() => call('shell:open', s.homepage || s.listingUrls?.[0])} />
                  <IconButton icon={Trash2} label="Delete" onClick={async () => { if (await confirmDialog(`Delete the source “${s.name}”?`, 'Opportunities already found from it stay.', { confirmLabel: 'Delete', destructive: true })) call('col:delete', 'sources', s.id); }} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && <SourceEditor source={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}
