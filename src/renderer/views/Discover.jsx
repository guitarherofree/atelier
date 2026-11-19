// Discover: new opportunities from your sources, plus ways to add more.
import { useState } from 'preact/hooks';
import { Compass, Link, Plus, Search, Globe, RefreshCw, ChevronDown, TriangleAlert, Check } from 'lucide-preact';
import { data, discovery, call, openModal, fits, uiPrefs, setUiPref, go, meta } from '../lib/store.js';
import { deadlineOf, oppName, OPP_TYPES } from '../../shared/schema.mjs';
import { ERROR_TEXT } from '../lib/errors.js';
import { OppCard } from '../components/OppCard.jsx';
import { Button, Empty, Select, Spinner } from '../components/Common.jsx';
import { ago, plural } from '../lib/format.js';

const VERDICT_ORDER = { strong: 0, possible: 1, unknown: 2, weak: 3, unlikely: 4 };

export function sortOpps(list, by, fitMap) {
  const dl = (o) => { const d = deadlineOf(o); return d.kind === 'date' ? d.date : d.kind === 'rolling' ? '9998' : '9999'; };
  const arr = [...list];
  if (by === 'fit') arr.sort((a, b) => (VERDICT_ORDER[fitMap.get(a.id)?.verdict] ?? 5) - (VERDICT_ORDER[fitMap.get(b.id)?.verdict] ?? 5) || (fitMap.get(b.id)?.score ?? 0) - (fitMap.get(a.id)?.score ?? 0) || dl(a).localeCompare(dl(b)));
  else if (by === 'deadline') arr.sort((a, b) => dl(a).localeCompare(dl(b)));
  else if (by === 'added') arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  else if (by === 'name') arr.sort((a, b) => oppName(a).localeCompare(oppName(b)));
  return arr;
}

function RunStatus() {
  const d = discovery.value;
  const [open, setOpen] = useState(false);
  const sources = data.value.sources;
  const rows = d.running ? Object.values(d.sources || {}) : sources.filter((s) => s.enabled && s.lastRun).map((s) => ({ ...s.lastRun, name: s.name, sourceId: s.id, phase: 'done' }));
  if (!rows.length) return null;
  const problems = rows.filter((r) => r.status && !['ok', 'manual'].includes(r.status));
  const added = rows.reduce((n, r) => n + (r.added || 0), 0);
  return (
    <div class={`run-status${d.running ? ' running' : ''}`}>
      <button type="button" class="run-status-head" onClick={() => setOpen(!open)}>
        {d.running ? <Spinner /> : problems.length ? <TriangleAlert size={14} class="tone-warn" /> : <Check size={14} class="tone-ok" />}
        <span>
          {d.running ? `Checking ${rows.length} sources…` : `Last check ${ago(meta.value.lastDiscoveryAt)}: ${plural(added, 'new opportunity', 'new opportunities')}`}
          {!d.running && problems.length > 0 && ` · ${plural(problems.length, 'source')} had problems`}
        </span>
        <ChevronDown size={14} class={open ? 'rot' : ''} />
      </button>
      {open && (
        <table class="run-table">
          <tbody>
            {rows.map((r) => (
              <tr>
                <td><button type="button" class="link" onClick={() => go('sources')}>{r.name}</button></td>
                <td>{r.phase === 'listing' ? 'Reading listing…' : r.phase === 'details' ? `Reading pages ${r.done || 0}/${r.total || 0}` : r.phase === 'waiting' ? 'Waiting' : r.status === 'manual' ? 'Manual' : `${r.found ?? 0} found · ${r.added ?? 0} new${r.skippedPast ? ` · ${r.skippedPast} past deadline` : ''}${r.pending ? ` · ${r.pending} more next time` : ''}`}</td>
                <td class="muted">{r.status && !['ok', 'manual'].includes(r.status) ? (ERROR_TEXT[r.status] || r.errors?.[0]?.message || r.status) : r.message || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Discover() {
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [type, setType] = useState('');
  const [verdict, setVerdict] = useState('');
  const prefs = uiPrefs.value;
  const all = data.value.opportunities.filter((o) => o.status === 'new');
  const fitMap = fits.value;
  let list = all;
  if (prefs.hidePast) list = list.filter((o) => { const d = deadlineOf(o); return !(d.kind === 'date' && d.days < 0); });
  if (source) list = list.filter((o) => (o.origin?.sourceId || o.origin?.kind) === source);
  if (type) list = list.filter((o) => o.fields?.type?.value === type);
  if (verdict) list = list.filter((o) => fitMap.get(o.id)?.verdict === verdict);
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter((o) => JSON.stringify(o.fields).toLowerCase().includes(needle));
  }
  list = sortOpps(list, prefs.discoverSort || 'fit', fitMap);
  const past = all.filter((o) => { const d = deadlineOf(o); return d.kind === 'date' && d.days < 0; });
  const sourceOptions = [{ value: '', label: 'All sources' }, ...data.value.sources.map((s) => ({ value: s.id, label: s.name })), { value: 'url', label: 'Pasted links' }, { value: 'capture', label: 'Captured pages' }, { value: 'search', label: 'Web searches' }, { value: 'instagram', label: 'Instagram' }];
  return (
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Discover</h1>
          <p class="page-sub">New opportunities from your sources. Save the ones worth a closer look; dismiss the rest.</p>
        </div>
        <div class="page-actions">
          <Button icon={Link} onClick={() => openModal('addUrl')}>Add from URL</Button>
          <Button icon={Plus} onClick={() => openModal('addManual')}>Add by hand</Button>
          <Button icon={Search} onClick={() => openModal('search')}>Search the web</Button>
          <Button icon={Globe} onClick={() => call('browser:open', null, 'Browse to an opportunity page, then click Capture.')}>Atelier browser</Button>
          <Button kind="primary" icon={RefreshCw} onClick={() => call('discovery:run')} disabled={discovery.value.running}>{discovery.value.running ? 'Checking…' : 'Find new'}</Button>
        </div>
      </header>
      <RunStatus />
      <div class="filters">
        <input class="input search" placeholder="Filter…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <Select value={source} onChange={setSource} options={sourceOptions} />
        <Select value={type} onChange={setType} options={[{ value: '', label: 'Any type' }, ...OPP_TYPES]} />
        <Select value={verdict} onChange={setVerdict} options={[{ value: '', label: 'Any fit' }, { value: 'strong', label: 'Strong fit' }, { value: 'possible', label: 'Possible fit' }, { value: 'unknown', label: 'Not enough info' }, { value: 'weak', label: 'Weak fit' }, { value: 'unlikely', label: 'Unlikely' }]} />
        <Select value={prefs.discoverSort || 'fit'} onChange={(v) => setUiPref('discoverSort', v)} options={[{ value: 'fit', label: 'Best fit first' }, { value: 'deadline', label: 'Soonest deadline' }, { value: 'added', label: 'Newest' }, { value: 'name', label: 'Name' }]} />
        <label class="check"><input type="checkbox" checked={prefs.hidePast} onChange={(e) => setUiPref('hidePast', e.currentTarget.checked)} /> Hide past deadlines</label>
        <span class="spacer" />
        {past.length > 0 && <Button small kind="ghost" onClick={() => call('opp:setStatusMany', past.map((o) => o.id), 'dismissed')}>Dismiss {past.length} past</Button>}
      </div>
      {list.length ? (
        <div class="card-list">{list.map((o) => <OppCard key={o.id} opp={o} />)}</div>
      ) : (
        <Empty icon={Compass} title={all.length ? 'Nothing matches these filters' : 'Nothing new right now'}>
          {all.length ? <p>Clear the filters to see all {all.length} new opportunities.</p> : (
            <>
              <p>Click <b>Find new</b> to check your {data.value.sources.filter((s) => s.enabled).length} sources, paste a link to an open call, or search the web.</p>
              <p class="muted">Tip: fill in your Artist Profile first so Atelier can tell you how each opportunity fits.</p>
            </>
          )}
        </Empty>
      )}
    </div>
  );
}
