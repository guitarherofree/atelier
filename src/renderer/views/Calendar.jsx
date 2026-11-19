// Deadlines and dates on a month calendar. Choose which opportunities appear, and export them to Apple Calendar.
import { useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, CalendarPlus, Download } from 'lucide-preact';
import { data, go, call } from '../lib/store.js';
import { calendarItems, CAL_KINDS, onCalendar } from '../../shared/calendar.mjs';
import { oppName, isoDate, todayISO } from '../../shared/schema.mjs';
import { Button, Modal, Toggle } from '../components/Common.jsx';
import { fmtDate } from '../lib/format.js';

function monthGrid(year, month, weekStartsOn = 0) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  const days = [];
  for (let i = 0; i < 42; i += 1) days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return days;
}

function ExportModal({ items, onClose }) {
  const today = todayISO();
  const upcoming = items.filter((i) => (i.endDate || i.date) >= today);
  const defaults = new Set(data.value.settings.calendar?.defaultKinds || ['deadline', 'target', 'rec']);
  const [sel, setSel] = useState(() => new Set(upcoming.filter((i) => defaults.has(i.kind)).map((i) => i.id)));
  const toggle = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const run = async (mode) => { const r = await call('calendar:export', { ids: [...sel], mode }); if (r?.count) onClose(); };
  return (
    <Modal title="Export to Apple Calendar" onClose={onClose} wide footer={<>
      <span class="muted small">{sel.size} selected</span><span class="spacer" />
      <Button onClick={() => run('file')} icon={Download} disabled={!sel.size}>Save .ics file…</Button>
      <Button kind="primary" icon={CalendarPlus} onClick={() => run('calendar')} disabled={!sel.size}>Add to Apple Calendar</Button>
    </>}>
      <p class="muted">Upcoming dates for the opportunities on your calendar. Deadlines, your target dates and letter due dates get reminders.</p>
      <div class="export-list">
        {upcoming.map((i) => (
          <label class="check export-row"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /><span class="mono">{i.date}</span> <span class={`dot kind-${i.kind}`} /> {i.title}</label>
        ))}
        {!upcoming.length && <p class="muted">No upcoming dates.</p>}
      </div>
    </Modal>
  );
}

export function CalendarView() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [kinds, setKinds] = useState(() => new Set(CAL_KINDS.map((k) => k.key)));
  const [showHidden, setShowHidden] = useState(false);
  const [exporting, setExporting] = useState(false);
  const d = data.value;
  const weekStartsOn = Number(d.settings.general?.weekStartsOn || 0);
  const items = calendarItems(d, { kinds: [...kinds], includeHidden: showHidden });
  const byDate = new Map();
  for (const it of items) {
    const end = it.endDate || it.date;
    const s = new Date(`${it.date}T00:00`);
    const e = new Date(`${end}T00:00`);
    for (let t = new Date(s); t <= e && (t - s) / 86400000 < 120; t.setDate(t.getDate() + 1)) {
      const k = isoDate(t);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push({ ...it, continuing: k !== it.date });
    }
  }
  const days = monthGrid(ym.y, ym.m, weekStartsOn);
  const today = todayISO();
  const step = (n) => { const dt = new Date(ym.y, ym.m + n, 1); setYm({ y: dt.getFullYear(), m: dt.getMonth() }); };
  const candidates = d.opportunities.filter((o) => o.status !== 'dismissed' && (o.status === 'saved' || d.applications.some((a) => a.opportunityId === o.id) || o.calendar === true) && (o.fields?.deadline?.value || o.fields?.openingDate?.value || o.fields?.programDates?.value));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + ((i + weekStartsOn) % 7)).toLocaleDateString('en-US', { weekday: 'short' }));
  return (
    <div class="page page-wide">
      <header class="page-head">
        <div><h1>Calendar</h1><p class="page-sub">Deadlines and dates for the opportunities you choose on the right.</p></div>
        <div class="page-actions"><Button kind="primary" icon={CalendarPlus} onClick={() => setExporting(true)}>Export to Apple Calendar…</Button></div>
      </header>
      <div class="cal-layout">
        <div class="cal">
          <div class="cal-head">
            <Button small kind="ghost" icon={ChevronLeft} onClick={() => step(-1)} aria-label="Previous month" />
            <h2>{new Date(ym.y, ym.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
            <Button small kind="ghost" icon={ChevronRight} onClick={() => step(1)} aria-label="Next month" />
            <Button small onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</Button>
            <span class="spacer" />
            <div class="cal-kinds">
              {CAL_KINDS.map((k) => (
                <label class="check small"><input type="checkbox" checked={kinds.has(k.key)} onChange={() => { const n = new Set(kinds); if (n.has(k.key)) n.delete(k.key); else n.add(k.key); setKinds(n); }} /><span class={`dot kind-${k.key}`} />{k.label}</label>
              ))}
            </div>
          </div>
          <div class="cal-grid">
            {weekdays.map((w) => <div class="cal-wd">{w}</div>)}
            {days.map((day) => {
              const k = isoDate(day);
              const list = byDate.get(k) || [];
              return (
                <div class={`cal-day${day.getMonth() !== ym.m ? ' other' : ''}${k === today ? ' today' : ''}`}>
                  <div class="cal-num">{day.getDate()}</div>
                  {list.slice(0, 4).map((it) => (
                    <button type="button" class={`cal-item kind-${it.kind}${it.continuing ? ' cont' : ''}`} title={`${it.title}${it.detail ? `\n${it.detail}` : ''}`}
                      onClick={() => (it.appId ? go('application', { id: it.appId }) : go('opportunity', { id: it.oppId }))}>
                      {it.continuing ? '…' : ''}{it.title.replace(/^(Deadline|Opens|Finish|Letter due): /, '')}
                    </button>
                  ))}
                  {list.length > 4 && <div class="cal-more">+{list.length - 4} more</div>}
                </div>
              );
            })}
          </div>
        </div>
        <aside class="cal-side">
          <h4>On the calendar</h4>
          <p class="muted small">Saved opportunities and ones you’re applying to appear automatically. Switch any off or on.</p>
          <div class="cal-list">
            {candidates.map((o) => (
              <label class="check cal-opt">
                <input type="checkbox" checked={onCalendar(o, d.applications)} onChange={(e) => call('opp:update', o.id, { calendar: e.currentTarget.checked })} />
                <span><span class="cal-opt-name">{oppName(o)}</span><span class="muted small">{o.fields?.deadline?.value === 'rolling' ? 'Rolling' : o.fields?.deadline?.value ? fmtDate(o.fields.deadline.value) : ''}</span></span>
              </label>
            ))}
            {!candidates.length && <p class="muted">Save opportunities to see them here.</p>}
          </div>
          <Toggle checked={showHidden} onChange={setShowHidden} label="Also show switched-off ones" />
        </aside>
      </div>
      {exporting && <ExportModal items={items} onClose={() => setExporting(false)} />}
    </div>
  );
}
