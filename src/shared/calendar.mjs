// Calendar entries derived from opportunities and applications (shared by the calendar view and the
// Apple Calendar export).
import { oppName, APP_STATUS_BY_KEY } from './schema.mjs';

export const CAL_KINDS = [
  { key: 'deadline', label: 'Deadlines' },
  { key: 'opening', label: 'Calls opening' },
  { key: 'target', label: 'Your target dates' },
  { key: 'rec', label: 'Letters due' },
  { key: 'program', label: 'Residency dates' },
];

/** Whether an opportunity appears on the calendar (you can switch any of them on or off). */
export function onCalendar(opp, apps) {
  if (opp.calendar === true) return true;
  if (opp.calendar === false) return false;
  if (opp.status === 'dismissed') return false;
  const app = apps.find((a) => a.opportunityId === opp.id);
  return opp.status === 'saved' || Boolean(app && APP_STATUS_BY_KEY[app.status]?.group !== 'done');
}

export function calendarItems({ opportunities = [], applications = [], contacts = [] }, { kinds = CAL_KINDS.map((k) => k.key), includeHidden = false } = {}) {
  const out = [];
  const want = new Set(kinds);
  for (const opp of opportunities) {
    if (!includeHidden && !onCalendar(opp, applications)) continue;
    const name = oppName(opp);
    const f = opp.fields || {};
    const dl = f.deadline?.value;
    if (want.has('deadline') && dl && dl !== 'rolling') {
      out.push({ id: `${opp.id}:deadline`, uid: `atelier-${opp.id}-deadline`, kind: 'deadline', date: dl, title: `Deadline: ${name}`, oppId: opp.id, url: f.applyUrl?.value || opp.url, detail: f.deadline?.text || '' });
    }
    const op = f.openingDate?.value;
    if (want.has('opening') && op) out.push({ id: `${opp.id}:opening`, uid: `atelier-${opp.id}-opening`, kind: 'opening', date: op, title: `Opens: ${name}`, oppId: opp.id, url: opp.url });
    const pd = f.programDates?.value;
    if (want.has('program') && pd && typeof pd === 'object' && pd.start) {
      out.push({ id: `${opp.id}:program`, uid: `atelier-${opp.id}-program`, kind: 'program', date: pd.start, endDate: pd.end || null, title: name, oppId: opp.id, url: opp.url });
    }
  }
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  for (const app of applications) {
    const opp = byId.get(app.opportunityId);
    if (!opp || APP_STATUS_BY_KEY[app.status]?.group === 'done') continue;
    if (!includeHidden && opp.calendar === false) continue;
    const name = oppName(opp);
    if (want.has('target') && app.targetDate) out.push({ id: `${app.id}:target`, uid: `atelier-${app.id}-target`, kind: 'target', date: app.targetDate, title: `Finish: ${name}`, oppId: opp.id, appId: app.id, url: opp.url });
    for (const r of app.recommendations || []) {
      if (!want.has('rec') || !r.dueDate || ['submitted', 'declined'].includes(r.status)) continue;
      const who = contacts.find((c) => c.id === r.contactId)?.name || 'Recommender';
      out.push({ id: `${app.id}:rec:${r.id}`, uid: `atelier-${app.id}-rec-${r.id}`, kind: 'rec', date: r.dueDate, title: `Letter due: ${who} (${name})`, oppId: opp.id, appId: app.id, url: opp.url });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
