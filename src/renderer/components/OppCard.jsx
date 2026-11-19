// An opportunity as a card (Discover) or a row (Opportunities).
import { Bookmark, BookmarkCheck, Ban, TriangleAlert, WifiOff, Undo2 } from 'lucide-preact';
import { oppName, fieldText, verifyCount, APP_STATUS_BY_KEY, hostOf } from '../../shared/schema.mjs';
import { go, call, fits, appByOpp, data } from '../lib/store.js';
import { DeadlineBadge, ModeBadge, LocationText, FitBadge, FeeText, Badge, Button } from './Common.jsx';

export function checkIssue(opp) {
  const c = opp.check || {};
  if (c.error && ['offline', 'timeout', 'not-found', 'blocked', 'needs-login', 'rate-limited', 'server', 'empty', 'unknown'].includes(c.status)) {
    return { tone: c.status === 'not-found' ? 'bad' : 'warn', label: c.status === 'not-found' ? 'Page gone' : 'Couldn’t check', icon: WifiOff, title: c.error };
  }
  if (c.status === 'changed') return { tone: 'warn', label: 'Changed on site', icon: TriangleAlert, title: [...(c.changedFields || []), ...(c.conflicts || [])].join(', ') };
  return null;
}

export function OppCard({ opp, compact }) {
  const fit = fits.value.get(opp.id);
  const app = appByOpp.value.get(opp.id);
  const nVerify = verifyCount(opp, { staleAfterDays: data.value.settings.general?.staleAfterDays });
  const issue = checkIssue(opp);
  const org = fieldText('organization', opp.fields?.organization);
  const funding = (opp.fields?.fundingType?.value || []).filter((x) => !/no funding/i.test(x)).slice(0, 3);
  const reasons = (fit?.reasons || []).filter((r) => r.tone === 'good' || r.tone === 'bad' || r.tone === 'warn').slice(0, 3);
  const source = opp.origin?.sourceName || (opp.origin?.kind === 'manual' ? 'Added by hand' : hostOf(opp.url));
  return (
    <article class={`opp-card status-${opp.status}`} onClick={() => go('opportunity', { id: opp.id })}>
      <div class="opp-card-main">
        <div class="opp-card-title">
          <h3>{oppName(opp)}</h3>
          {app && <Badge tone="accent">{APP_STATUS_BY_KEY[app.status]?.label}</Badge>}
        </div>
        <div class="opp-card-sub">
          {org && <span>{org}</span>}
          <LocationText opp={opp} />
          <span class="muted">{fieldText('type', opp.fields?.type)}</span>
        </div>
        <div class="opp-card-badges">
          <DeadlineBadge opp={opp} />
          <ModeBadge opp={opp} />
          <FitBadge fit={fit} />
          <FeeText opp={opp} />
          {funding.map((f) => <Badge tone="soft">{f}</Badge>)}
          {issue && <Badge tone={issue.tone} icon={issue.icon} title={issue.title}>{issue.label}</Badge>}
          {nVerify > 0 && <Badge tone="verify" title="Details extracted automatically that you haven’t confirmed">{nVerify} to verify</Badge>}
        </div>
        {!compact && reasons.length > 0 && (
          <ul class="opp-card-reasons">
            {reasons.map((r) => <li class={`tone-${r.tone}`}>{r.label}</li>)}
          </ul>
        )}
        <div class="opp-card-source">{source}{(opp.alsoListed || []).length ? ` · also on ${opp.alsoListed.map((a) => a.sourceName).join(', ')}` : ''}</div>
      </div>
      <div class="opp-card-actions" onClick={(e) => e.stopPropagation()}>
        {opp.status === 'new' && <Button small kind="primary" icon={Bookmark} onClick={() => call('opp:setStatus', opp.id, 'saved')}>Save</Button>}
        {opp.status === 'saved' && <Button small icon={BookmarkCheck} disabled>Saved</Button>}
        {opp.status !== 'dismissed' && <Button small kind="ghost" icon={Ban} onClick={() => call('opp:setStatus', opp.id, 'dismissed')}>Dismiss</Button>}
        {opp.status === 'dismissed' && <Button small kind="ghost" icon={Undo2} onClick={() => call('opp:setStatus', opp.id, 'new')}>Restore</Button>}
      </div>
    </article>
  );
}
