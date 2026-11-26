// Opportunities you saved (and, if you like, the ones you dismissed).
import { useState } from 'preact/hooks';
import { Bookmark, Plus, Link, RefreshCw } from 'lucide-preact';
import { data, go, fits, appByOpp, openModal, uiPrefs, setUiPref, call } from '../lib/store.js';
import { oppName, fieldText, verifyCount, APP_STATUS_BY_KEY, OPP_TYPES, deadlineOf, FOCUS_FILTERS, matchesFocus } from '../../shared/schema.mjs';
import { Button, Empty, Select, DeadlineBadge, ModeBadge, FocusBadge, FitBadge, Badge, LocationText } from '../components/Common.jsx';
import { checkIssue } from '../components/OppCard.jsx';
import { sortOpps } from './Discover.jsx';
import { ago } from '../lib/format.js';

export function Opportunities() {
  const [status, setStatus] = useState('saved');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const prefs = uiPrefs.value;
  const fitMap = fits.value;
  const apps = appByOpp.value;
  const staleAfterDays = data.value.settings.general?.staleAfterDays;
  let list = data.value.opportunities.filter((o) => (status === 'all' ? o.status !== 'dismissed' : o.status === status));
  if (type) list = list.filter((o) => o.fields?.type?.value === type);
  if (tag) list = list.filter((o) => (o.tags || []).includes(tag));
  if (prefs.oppFocus) list = list.filter((o) => matchesFocus(o, prefs.oppFocus));
  if (prefs.hidePastSaved) list = list.filter((o) => { const d = deadlineOf(o); return !(d.kind === 'date' && d.days < 0); });
  if (q.trim()) { const n = q.trim().toLowerCase(); list = list.filter((o) => `${JSON.stringify(o.fields)} ${o.notes} ${(o.tags || []).join(' ')}`.toLowerCase().includes(n)); }
  list = sortOpps(list, prefs.oppSort || 'deadline', fitMap);
  const tags = [...new Set(data.value.opportunities.flatMap((o) => o.tags || []))].sort();
  const toCheck = list.filter((o) => o.url).map((o) => o.id);
  return (
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Opportunities</h1>
          <p class="page-sub">Everything you saved. Atelier re-checks these pages every {data.value.settings.general?.recheckEveryDays || 3} days and flags anything that changed.</p>
        </div>
        <div class="page-actions">
          <Button icon={Link} onClick={() => openModal('addUrl', { status: 'saved' })}>Add from URL</Button>
          <Button icon={Plus} onClick={() => openModal('addManual')}>Add by hand</Button>
          <Button icon={RefreshCw} onClick={async () => { for (const id of toCheck.slice(0, 30)) await call('opp:recheck', id); }} title="Re-check these pages now">Re-check all</Button>
        </div>
      </header>
      <div class="filters">
        <input class="input search" placeholder="Filter…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <Select value={status} onChange={setStatus} options={[{ value: 'saved', label: 'Saved' }, { value: 'all', label: 'Saved and new' }, { value: 'dismissed', label: 'Dismissed' }]} />
        <Select value={type} onChange={setType} options={[{ value: '', label: 'Any type' }, ...OPP_TYPES]} />
        <Select value={prefs.oppFocus || ''} onChange={(v) => setUiPref('oppFocus', v)} options={FOCUS_FILTERS} title="Time and space residencies ask for no project, output or public programme" />
        {tags.length > 0 && <Select value={tag} onChange={setTag} options={[{ value: '', label: 'Any tag' }, ...tags]} />}
        <Select value={prefs.oppSort || 'deadline'} onChange={(v) => setUiPref('oppSort', v)} options={[{ value: 'deadline', label: 'Soonest deadline' }, { value: 'fit', label: 'Best fit first' }, { value: 'added', label: 'Newest' }, { value: 'name', label: 'Name' }]} />
        <label class="check"><input type="checkbox" checked={!!prefs.hidePastSaved} onChange={(e) => setUiPref('hidePastSaved', e.currentTarget.checked)} /> Hide past deadlines</label>
      </div>
      {list.length ? (
        <table class="opp-table">
          <thead><tr><th>Opportunity</th><th>Deadline</th><th>Where</th><th>Fit</th><th>Application</th><th>Checked</th></tr></thead>
          <tbody>
            {list.map((o) => {
              const app = apps.get(o.id);
              const n = verifyCount(o, { staleAfterDays });
              const issue = checkIssue(o);
              return (
                <tr onClick={() => go('opportunity', { id: o.id })}>
                  <td>
                    <div class="cell-title">{oppName(o)}</div>
                    <div class="cell-sub">{fieldText('organization', o.fields?.organization)}{(o.tags || []).map((t) => <span class="mini-tag">{t}</span>)}</div>
                  </td>
                  <td><DeadlineBadge opp={o} /></td>
                  <td><LocationText opp={o} /> <ModeBadge opp={o} /> <FocusBadge opp={o} /></td>
                  <td><FitBadge fit={fitMap.get(o.id)} /></td>
                  <td>{app ? <Badge tone="accent">{APP_STATUS_BY_KEY[app.status]?.label}</Badge> : <span class="muted">—</span>}</td>
                  <td>
                    <div class="cell-sub">{o.check?.lastCheckedAt ? ago(o.check.lastCheckedAt) : o.origin?.kind === 'manual' ? 'Entered by hand' : 'Not yet'}</div>
                    {issue && <Badge tone={issue.tone} icon={issue.icon} title={issue.title}>{issue.label}</Badge>}
                    {n > 0 && <Badge tone="verify">{n} to verify</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Empty icon={Bookmark} title={prefs.oppFocus || type || tag || q.trim() ? 'Nothing matches these filters' : status === 'saved' ? 'No saved opportunities yet' : 'Nothing here'}>
          <p>Save opportunities from <button type="button" class="link" onClick={() => go('discover')}>Discover</button>, paste a link, or add one by hand.</p>
        </Empty>
      )}
    </div>
  );
}
