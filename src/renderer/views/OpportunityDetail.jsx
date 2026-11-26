// One opportunity: every detail with its source, when it was checked, and whether to verify it.
import { useState, useEffect } from 'preact/hooks';
import { diffWords } from 'diff';
import {
  ChevronLeft, ExternalLink, RefreshCw, Bookmark, Ban, Trash2, Pencil, Check, Sparkles, Globe, ClipboardList, Plus, Undo2,
  TriangleAlert, CalendarPlus, MapPin, X,
} from 'lucide-preact';
import { data, call, back, go, fits, appByOpp, meta, toast, setRouteParams } from '../lib/store.js';
import { OPP_FIELDS, oppName, fieldText, fieldStatus, verifyCount, ORIGIN_LABELS, hostOf, APP_STATUS_BY_KEY } from '../../shared/schema.mjs';
import { FIT_CRITERIA } from '../../shared/fit.mjs';
import { Button, IconButton, Badge, Tabs, Provenance, DeadlineBadge, ModeBadge, FitBadge, TagInput, TextArea, Empty, Spinner, Toggle } from '../components/Common.jsx';
import { FieldEditor } from '../components/FieldEditor.jsx';
import { ERROR_TEXT } from '../lib/errors.js';
import { ago, fmtDate } from '../lib/format.js';

function ValueView({ def, fv }) {
  if (!fv) return <span class="muted">Not found</span>;
  const text = fieldText(def.key, fv);
  if (def.type === 'url' && fv.value) return <a href={fv.value} onClick={(e) => { e.preventDefault(); call('shell:open', fv.value); }}>{fv.value}</a>;
  if (def.type === 'list') return <span class="chips">{(fv.value || []).map((x) => <span class="chip">{x}</span>)}</span>;
  if (def.type === 'deadline' && fv.value && fv.value !== 'rolling') return <span>{fmtDate(fv.value)}{fv.text && fv.text !== fmtDate(fv.value) && !/^\d{4}-\d{2}-\d{2}$/.test(fv.text.trim()) ? <span class="muted"> · as written: “{fv.text.slice(0, 80)}”</span> : ''}</span>;
  if (def.type === 'date' && fv.value) return <span>{fmtDate(fv.value)}</span>;
  if (def.type === 'daterange' && fv.value?.start) return <span>{fmtDate(fv.value.start)}{fv.value.end ? ` – ${fmtDate(fv.value.end)}` : ''}</span>;
  if (def.type === 'longtext') return <div class="longtext">{text}</div>;
  return <span>{text}</span>;
}

function siteText(def, v) {
  if (!v) return '—';
  const val = v.value;
  if ((def.type === 'deadline' || def.type === 'date') && val && val !== 'rolling' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return fmtDate(val);
  if (def.type === 'daterange' && val?.start) return `${fmtDate(val.start)}${val.end ? ` – ${fmtDate(val.end)}` : ''}`;
  return fieldText(def.key, { value: val, text: v.text }) || '—';
}

function FieldRow({ opp, def, staleAfterDays }) {
  const fv = opp.fields?.[def.key];
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const st = fieldStatus(fv, { staleAfterDays, important: def.important });
  const save = async (v) => { await call('opp:setField', opp.id, def.key, v); setEditing(false); };
  return (
    <div class={`field-row state-${st.state}${st.needsVerify ? ' needs-verify' : ''}`}>
      <div class="field-label" title={def.help}>{def.label}</div>
      <div class="field-value">
        {editing ? <FieldEditor def={def} fv={fv} onSave={save} onCancel={() => setEditing(false)} /> : <ValueView def={def} fv={fv} />}
        {editing && def.help && <div class="field-help">{def.help}</div>}
        {!editing && fv?.siteValue && (
          <div class="field-alert tone-bad">
            <TriangleAlert size={13} /> <span>The site now says: <b>{siteText(def, fv.siteValue)}</b> (seen {ago(fv.siteValue.seenAt)})</span>
            <Button small onClick={() => call('opp:acceptSite', opp.id, def.key)}>Use site’s value</Button>
            <Button small kind="ghost" onClick={() => call('opp:keepMine', opp.id, def.key)}>Keep mine</Button>
          </div>
        )}
        {!editing && fv?.previous && st.state === 'changed' && (
          <div class="field-alert tone-warn">
            <TriangleAlert size={13} /> <span>Changed on the site {ago(fv.changedAt)}. Before: <b>{siteText(def, fv.previous)}</b></span>
            <Button small onClick={() => call('opp:verifyField', opp.id, def.key)}>Looks right</Button>
            <Button small kind="ghost" icon={Undo2} onClick={() => call('opp:revert', opp.id, def.key)}>Undo</Button>
          </div>
        )}
        {!editing && fv?.missingOnSiteAt && fv.origin !== 'manual' && (
          <div class="field-alert tone-warn"><TriangleAlert size={13} /> <span>This detail wasn’t on the page at the last check ({ago(fv.missingOnSiteAt)}).</span></div>
        )}
        {open && fv && !editing && (
          <div class="field-detail">
            <div><b>How it was found:</b> {ORIGIN_LABELS[fv.origin] || fv.origin}{fv.method && fv.origin !== 'manual' ? ` (${fv.method})` : ''}{fv.provider ? ` · ${fv.provider}` : ''}</div>
            {fv.sourceUrl && <div><b>Source:</b> <a href={fv.sourceUrl} onClick={(e) => { e.preventDefault(); call('shell:open', fv.sourceUrl); }}>{fv.sourceUrl}</a></div>}
            {fv.extractedAt && <div><b>Found:</b> {fmtDate(fv.extractedAt, { dateStyle: 'medium' })} · <b>Last checked:</b> {fv.checkedAt ? fmtDate(fv.checkedAt, { dateStyle: 'medium' }) : 'never'}</div>}
            {fv.origin === 'manual' && fv.enteredAt && <div><b>Entered:</b> {fmtDate(fv.enteredAt, { dateStyle: 'medium' })}{fv.replaced ? ` · replaced an extracted value: “${fieldText(def.key, fv.replaced)}”` : ''}</div>}
            {fv.verifiedAt && fv.origin !== 'manual' && <div><b>Confirmed by you:</b> {fmtDate(fv.verifiedAt, { dateStyle: 'medium' })}</div>}
            {fv.confidence != null && fv.origin !== 'manual' && <div><b>Confidence:</b> {Math.round(fv.confidence * 100)}%</div>}
            {fv.evidence && <blockquote>{fv.evidence}</blockquote>}
          </div>
        )}
      </div>
      <div class="field-meta">
        {fv ? <button type="button" class="prov-btn" onClick={() => setOpen(!open)} title="Show where this came from"><Provenance fv={fv} important={def.important} /></button> : <span class="prov tone-muted"><span class="prov-label">Not found</span></span>}
      </div>
      <div class="field-actions">
        {fv && st.needsVerify && !fv.siteValue && st.state !== 'changed' && <IconButton icon={Check} label="Confirm this is right" class="confirm" onClick={() => call('opp:verifyField', opp.id, def.key)} />}
        <IconButton icon={Pencil} label={fv ? 'Edit' : 'Add'} onClick={() => setEditing(true)} />
      </div>
    </div>
  );
}

function CheckBanner({ opp }) {
  const c = opp.check || {};
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    setBusy(true);
    const r = await call('opp:recheck', opp.id);
    setBusy(false);
    if (r?.status === 'ok') toast(r.changed?.length || r.conflicts?.length ? `Re-checked: ${[...r.changed, ...r.conflicts].length} detail(s) changed` : 'Re-checked: nothing changed', 'success');
  };
  if (!opp.url) return <div class="banner tone-muted">Entered by hand, with no page to check. Add a page link (Edit › Organizer website or the link field) if there is one.</div>;
  if (c.error) {
    return (
      <div class="banner tone-warn">
        <TriangleAlert size={15} />
        <div>
          <b>Couldn’t check the page {c.lastAttemptAt ? ago(c.lastAttemptAt) : ''}.</b> {ERROR_TEXT[c.status] || c.error}
          {c.lastCheckedAt ? ` Details below were last confirmed against the page ${ago(c.lastCheckedAt)}.` : ' The details below come from the listing only — verify them on the page.'}
        </div>
        <div class="banner-actions">
          <Button small icon={Globe} onClick={() => call('browser:open', opp.url, 'Check the page here, then click Capture to update Atelier.')}>Open in Atelier browser</Button>
          <Button small icon={RefreshCw} onClick={recheck} disabled={busy}>{busy ? 'Checking…' : 'Try again'}</Button>
        </div>
      </div>
    );
  }
  if (c.status === 'changed') {
    const keys = [...(c.changedFields || []), ...(c.conflicts || []), ...(c.missing || [])];
    return (
      <div class="banner tone-warn">
        <TriangleAlert size={15} />
        <div><b>The page changed at the last check ({ago(c.lastCheckedAt)}).</b> Review: {keys.map((k) => OPP_FIELDS.find((f) => f.key === k)?.label || k).join(', ') || 'page text'}.</div>
        <div class="banner-actions"><Button small onClick={() => setRouteParams({ tab: 'history' })}>See what changed</Button></div>
      </div>
    );
  }
  return (
    <div class="banner tone-plain">
      <span>Checked against <a href={opp.url} onClick={(e) => { e.preventDefault(); call('shell:open', opp.url); }}>{hostOf(opp.url)}</a> {c.lastCheckedAt ? ago(c.lastCheckedAt) : 'not yet'}.</span>
      <div class="banner-actions"><Button small kind="ghost" icon={RefreshCw} onClick={recheck} disabled={busy}>{busy ? 'Checking…' : 'Re-check now'}</Button></div>
    </div>
  );
}

function FitPanel({ opp }) {
  const fit = fits.value.get(opp.id);
  const [busy, setBusy] = useState(false);
  const ai = meta.value.ai;
  const groups = [
    ['Why it may fit', fit.reasons.filter((r) => r.tone === 'good')],
    ['Concerns', fit.reasons.filter((r) => r.tone === 'bad' || r.tone === 'warn')],
    ['Unknown or worth checking', fit.reasons.filter((r) => r.tone === 'unknown' || r.tone === 'info')],
  ];
  return (
    <div class="fit-panel">
      <div class="fit-head">
        <FitBadge fit={fit} />
        {fit.score != null && <div class="fit-meter"><span style={{ width: `${fit.score}%` }} /></div>}
        {fit.score != null && <span class="muted">{fit.score}/100</span>}
        <span class="spacer" />
        <Button small kind="ghost" onClick={() => go('profile')}>Edit profile and priorities</Button>
      </div>
      {groups.map(([title, rs]) => rs.length > 0 && (
        <div class="fit-group">
          <h4>{title}</h4>
          <ul>{rs.map((r) => <li class={`tone-${r.tone}`}><b>{r.label}</b>{r.detail ? <span> — {r.detail}</span> : ''} <span class="muted small">({FIT_CRITERIA.find((c) => c.key === r.criterion)?.label})</span></li>)}</ul>
        </div>
      ))}
      <div class="ai-box">
        <div class="ai-box-head">
          <Sparkles size={14} /> <b>AI explanation</b>
          <span class="spacer" />
          <Button small disabled={busy || ai.provider === 'off'} title={ai.provider === 'off' ? 'Turn on AI in Settings › AI' : `Uses ${ai.label}`} onClick={async () => { setBusy(true); await call('opp:aiFit', opp.id); setBusy(false); }}>
            {busy ? 'Thinking…' : opp.aiFit ? 'Explain again' : 'Explain with AI'}
          </Button>
        </div>
        {opp.aiFit ? <div class="ai-text">{opp.aiFit.text}<div class="muted small">From {opp.aiFit.provider}, {ago(opp.aiFit.at)}. Based on the details above, which may need verifying.</div></div>
          : <p class="muted small">{ai.provider === 'off' ? 'AI is off. The checks above are done entirely on your Mac.' : 'Optional: a written explanation of how this fits your goals.'}</p>}
      </div>
    </div>
  );
}

function HistoryPanel({ opp }) {
  const [hist, setHist] = useState(null);
  const [idx, setIdx] = useState(null);
  useEffect(() => { call('opp:history', opp.id).then((h) => { setHist(h); setIdx(h?.versions?.length ? h.versions.length - 1 : null); }); }, [opp.id, opp.check?.lastCheckedAt]);
  if (!hist) return <Spinner label="Loading…" />;
  const v = hist.versions || [];
  if (!v.length) return <Empty title="No page text saved yet">Atelier keeps the page’s text each time it checks, so you can see what changed.</Empty>;
  const cur = v[idx];
  const prev = idx > 0 ? v[idx - 1] : null;
  const parts = prev ? diffWords(prev.text, cur.text) : null;
  return (
    <div class="history">
      <div class="history-versions">
        {v.map((x, i) => (
          <button type="button" class={`hv${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)}>
            {fmtDate(x.at, { dateStyle: 'medium' })}{x.lastSeenAt && x.lastSeenAt !== x.at ? <small>unchanged through {fmtDate(x.lastSeenAt, { month: 'short', day: 'numeric' })}</small> : null}
          </button>
        ))}
      </div>
      <div class="history-text">
        {prev ? <p class="muted small">Changes since {fmtDate(prev.at, { dateStyle: 'medium' })}: <ins>added</ins> <del>removed</del></p> : <p class="muted small">The first saved version of the page.</p>}
        <div class="page-text">
          {parts ? parts.map((p) => (p.added ? <ins>{p.value}</ins> : p.removed ? <del>{p.value}</del> : <span>{p.value}</span>)) : cur.text}
        </div>
      </div>
    </div>
  );
}

function NotesPanel({ opp }) {
  const allTags = [...new Set(data.value.opportunities.flatMap((o) => o.tags || []))];
  return (
    <div class="notes-panel">
      <label class="label">Tags</label>
      <TagInput value={opp.tags || []} onChange={(tags) => call('opp:update', opp.id, { tags })} suggestions={allTags} placeholder="e.g. 2027, sound, dream" />
      <label class="label">Notes</label>
      <TextArea value={opp.notes} rows={8} onSave={(notes) => call('opp:update', opp.id, { notes })} placeholder="Anything you want to remember about this opportunity." showCount={false} />
      <label class="label">Your own fields</label>
      <CustomFields opp={opp} />
    </div>
  );
}

function CustomFields({ opp }) {
  const list = opp.custom || [];
  const set = (next) => call('opp:update', opp.id, { custom: next });
  return (
    <div class="custom-fields">
      {list.map((c, i) => (
        <div class="custom-row">
          <input class="input" value={c.label} placeholder="Label" onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)))} />
          <input class="input" value={c.value} placeholder="Value" onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, value: e.currentTarget.value } : x)))} />
          <IconButton icon={X} label="Remove" onClick={() => set(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button small icon={Plus} onClick={() => set([...list, { label: '', value: '' }])}>Add a field</Button>
    </div>
  );
}

export function OpportunityDetail({ id, tab = 'details' }) {
  const opp = data.value.opportunities.find((o) => o.id === id);
  const [busy, setBusy] = useState('');
  if (!opp) return <div class="page"><Empty title="This opportunity was deleted"><Button onClick={back}>Go back</Button></Empty></div>;
  const app = appByOpp.value.get(opp.id);
  const staleAfterDays = data.value.settings.general?.staleAfterDays ?? 14;
  const nVerify = verifyCount(opp, { staleAfterDays });
  const toVerify = OPP_FIELDS.filter((f) => { const s = fieldStatus(opp.fields?.[f.key], { staleAfterDays, important: f.important }); return s.needsVerify && ['unverified', 'stale'].includes(s.state); }).map((f) => f.key);
  const org = fieldText('organization', opp.fields?.organization);
  const ai = meta.value.ai;
  const startApp = async () => { const a = await call('app:create', opp.id); if (a?.id) go('application', { id: a.id }); };
  return (
    <div class="page">
      <button type="button" class="back-link" onClick={back}><ChevronLeft size={14} /> Back</button>
      <header class="detail-head">
        <div class="detail-title">
          <h1>{oppName(opp)}</h1>
          <div class="detail-sub">
            {org && <span>{org}</span>}
            {opp.fields?.location?.value && opp.fields?.mode?.value !== 'Online' && <span><MapPin size={12} /> {opp.fields.location.value}</span>}
            <ModeBadge opp={opp} />
            <span class="muted">{opp.origin?.sourceName ? `From ${opp.origin.sourceName}` : opp.origin?.kind === 'manual' ? 'Added by hand' : opp.origin?.kind === 'url' ? 'From a pasted link' : opp.origin?.kind === 'capture' ? 'Captured in the Atelier browser' : ''}{opp.origin?.discoveredAt ? ` · ${fmtDate(opp.origin.discoveredAt)}` : ''}</span>
          </div>
          <div class="detail-badges">
            <DeadlineBadge opp={opp} long />
            <FitBadge fit={fits.value.get(opp.id)} />
            {nVerify > 0 && <Badge tone="verify">{nVerify} detail{nVerify === 1 ? '' : 's'} to verify</Badge>}
            {(opp.alsoListed || []).map((a) => <Badge tone="soft" title={a.url}>Also on {a.sourceName}</Badge>)}
          </div>
        </div>
        <div class="detail-actions">
          {app ? <Button kind="primary" icon={ClipboardList} onClick={() => go('application', { id: app.id })}>Application: {APP_STATUS_BY_KEY[app.status]?.label}</Button>
            : <Button kind="primary" icon={ClipboardList} onClick={startApp}>Start application</Button>}
          {opp.status !== 'saved' && <Button icon={Bookmark} onClick={() => call('opp:setStatus', opp.id, 'saved')}>Save</Button>}
          {opp.url && <Button icon={ExternalLink} onClick={() => call('shell:open', opp.url)}>Open page</Button>}
          <div class="more-actions">
            {opp.url && <IconButton icon={Globe} label="Open in the Atelier browser (sign in or capture)" onClick={() => call('browser:open', opp.url, 'Click Capture to update this opportunity from the page.')} />}
            <IconButton icon={Sparkles} label={ai.provider === 'off' ? 'Read the page with AI (turn on in Settings › AI)' : `Read the page again with ${ai.label}`} disabled={ai.provider === 'off' || busy === 'ai'} onClick={async () => { setBusy('ai'); const r = await call('opp:aiExtract', opp.id); setBusy(''); if (r?.updated) toast(r.updated.length ? `AI filled in: ${r.updated.join(', ')} — verify these` : 'AI found nothing new', 'success'); }} />
            {opp.status !== 'dismissed' ? <IconButton icon={Ban} label="Dismiss" onClick={() => call('opp:setStatus', opp.id, 'dismissed')} /> : <IconButton icon={Undo2} label="Restore" onClick={() => call('opp:setStatus', opp.id, 'new')} />}
            <IconButton icon={Trash2} label="Delete" onClick={async () => { if (await call('opp:delete', opp.id)) back(); }} />
          </div>
        </div>
      </header>
      <CheckBanner opp={opp} />
      <Tabs value={tab} onChange={(t) => setRouteParams({ tab: t })} tabs={[
        { key: 'details', label: 'Details', count: nVerify },
        { key: 'fit', label: 'Fit' },
        { key: 'history', label: 'Page history' },
        { key: 'notes', label: 'Notes & tags' },
      ]} />
      {tab === 'details' && (
        <div class="fields">
          <div class="fields-toolbar">
            <span class="muted small">Click a status to see where a detail came from. Edit anything — your edits are never overwritten.</span>
            <span class="spacer" />
            <Toggle checked={opp.calendar !== false && (opp.calendar === true || opp.status === 'saved' || !!app)} onChange={(v) => call('opp:update', opp.id, { calendar: v })} label="Show on calendar" />
            {toVerify.length > 0 && <Button small icon={Check} onClick={async () => { if (await window.atelier.invoke('ui:confirm', { message: `Confirm ${toVerify.length} extracted detail${toVerify.length === 1 ? '' : 's'}?`, detail: 'Only do this after reading them against the official page.', confirmLabel: 'Confirm' })) call('opp:verifyAll', opp.id, toVerify); }}>Confirm all after checking</Button>}
          </div>
          {OPP_FIELDS.map((def) => <FieldRow key={def.key} opp={opp} def={def} staleAfterDays={staleAfterDays} />)}
        </div>
      )}
      {tab === 'fit' && <FitPanel opp={opp} />}
      {tab === 'history' && <HistoryPanel opp={opp} />}
      {tab === 'notes' && <NotesPanel opp={opp} />}
    </div>
  );
}
