// Applications by stage. Drag a card to another column to change its status.
import { useState } from 'preact/hooks';
import { ClipboardList, Check, Mail } from 'lucide-preact';
import { data, go, call, byId } from '../lib/store.js';
import { APP_STATUSES, APP_STATUS_BY_KEY, oppName, materialStatus } from '../../shared/schema.mjs';
import { DeadlineBadge, Empty, Badge, Progress, Select } from '../components/Common.jsx';
import { fmtDate } from '../lib/format.js';

const COLUMNS = [
  { key: 'interested', label: 'Interested', statuses: ['interested'] },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'] },
  { key: 'review', label: 'Ready for review', statuses: ['review'] },
  { key: 'submitted', label: 'Submitted', statuses: ['submitted', 'waitlisted'] },
  { key: 'done', label: 'Decided', statuses: ['accepted', 'declined', 'withdrawn', 'skipped'] },
];

function AppCard({ app }) {
  const opp = byId.value.opportunities.get(app.opportunityId);
  const proposal = app.proposalId ? byId.value.proposals.get(app.proposalId) : null;
  const mats = (app.materials || []).filter((m) => m.required !== false);
  const done = mats.filter((m) => materialStatus(m, app, opp, proposal).status === 'done').length;
  const recs = app.recommendations || [];
  const recsReady = recs.filter((r) => ['agreed', 'submitted'].includes(r.status)).length;
  const confirmed = app.submission?.confirmedAt;
  return (
    <div class="app-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/atelier-app', app.id)} onClick={() => go('application', { id: app.id })}>
      <div class="app-card-title">{opp ? oppName(opp) : '(opportunity deleted)'}</div>
      {opp && <DeadlineBadge opp={opp} />}
      {app.targetDate && <div class="muted small">Your target: {fmtDate(app.targetDate, { month: 'short', day: 'numeric' })}</div>}
      <div class="app-card-progress"><Progress value={done} max={mats.length} /><span class="muted small">{done}/{mats.length} materials</span></div>
      <div class="app-card-badges">
        {recs.length > 0 && <Badge tone={recsReady === recs.length ? 'ok' : 'warn'} icon={Mail}>{recsReady}/{recs.length} letters</Badge>}
        {confirmed && <Badge tone="ok" icon={Check}>Reviewed</Badge>}
        {['accepted', 'declined', 'withdrawn', 'skipped', 'waitlisted'].includes(app.status) && <Badge tone={app.status === 'accepted' ? 'ok' : 'muted'}>{APP_STATUS_BY_KEY[app.status].label}</Badge>}
      </div>
    </div>
  );
}

export function Applications() {
  const [over, setOver] = useState(null);
  const [view, setView] = useState('board');
  const apps = data.value.applications;
  const opps = byId.value.opportunities;
  const dl = (a) => opps.get(a.opportunityId)?.fields?.deadline?.value || '9999';
  const sorted = [...apps].sort((a, b) => String(dl(a)).localeCompare(String(dl(b))));
  if (!apps.length) {
    return (
      <div class="page">
        <header class="page-head"><div><h1>Applications</h1></div></header>
        <Empty icon={ClipboardList} title="No applications yet">
          <p>Open an opportunity and click <b>Start application</b>. Atelier sets up a checklist from what the call asks for.</p>
        </Empty>
      </div>
    );
  }
  return (
    <div class="page page-wide">
      <header class="page-head">
        <div><h1>Applications</h1><p class="page-sub">Drag cards between columns, or open one to work on it.</p></div>
        <div class="page-actions"><Select value={view} onChange={setView} options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} /></div>
      </header>
      {view === 'board' ? (
        <div class="board">
          {COLUMNS.map((col) => {
            const list = sorted.filter((a) => col.statuses.includes(a.status));
            return (
              <div class={`board-col${over === col.key ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(col.key); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/atelier-app'); if (id) call('app:update', id, { status: col.statuses[0] }); }}>
                <div class="board-col-head">{col.label}<span class="muted">{list.length}</span></div>
                {list.map((a) => <AppCard key={a.id} app={a} />)}
              </div>
            );
          })}
        </div>
      ) : (
        <table class="opp-table">
          <thead><tr><th>Opportunity</th><th>Status</th><th>Deadline</th><th>Materials</th><th>Letters</th></tr></thead>
          <tbody>
            {sorted.map((a) => {
              const o = opps.get(a.opportunityId);
              const mats = (a.materials || []).filter((m) => m.required !== false);
              return (
                <tr onClick={() => go('application', { id: a.id })}>
                  <td class="cell-title">{o ? oppName(o) : '(deleted)'}</td>
                  <td onClick={(e) => e.stopPropagation()}><Select value={a.status} onChange={(v) => call('app:update', a.id, { status: v })} options={APP_STATUSES.map((s) => ({ value: s.key, label: s.label }))} /></td>
                  <td>{o && <DeadlineBadge opp={o} />}</td>
                  <td>{mats.filter((m) => materialStatus(m, a, o, byId.value.proposals.get(a.proposalId)).status === 'done').length}/{mats.length}</td>
                  <td>{(a.recommendations || []).filter((r) => ['agreed', 'submitted'].includes(r.status)).length}/{(a.recommendations || []).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
