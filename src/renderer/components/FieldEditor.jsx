// Editing one opportunity detail. Anything you save here becomes "Entered by you" and is never
// overwritten by a later re-check.
import { useState } from 'preact/hooks';
import { DISCIPLINES, FUNDING_KINDS, REQUIREMENT_KINDS, fieldText } from '../../shared/schema.mjs';
import { Button, TagInput, Select } from './Common.jsx';
import { fmtDate } from '../lib/format.js';

const SUGGEST = { discipline: DISCIPLINES, fundingType: FUNDING_KINDS, requirements: REQUIREMENT_KINDS };
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'NZD', 'BRL'];

export function initialDraft(def, fv) {
  const v = fv?.value;
  switch (def.type) {
    case 'list': return Array.isArray(v) ? v : v ? [String(v)] : [];
    case 'money': return v && typeof v === 'object' ? { amount: v.amount ?? '', currency: v.currency || 'USD', free: v.amount === 0 } : { amount: '', currency: 'USD', free: false };
    case 'deadline': return { date: v && v !== 'rolling' ? v : '', rolling: v === 'rolling', text: fv?.text || '' };
    case 'daterange': return v && typeof v === 'object' ? { start: v.start || '', end: v.end || '' } : { start: '', end: '' };
    default: return fieldText(def.key, fv);
  }
}

export function draftToValue(def, d) {
  switch (def.type) {
    case 'list': return { value: d };
    case 'money':
      if (d.free) return { value: { amount: 0, currency: null } };
      if (d.amount === '' || d.amount == null) return { value: null };
      return { value: { amount: Number(d.amount), currency: d.currency || null } };
    case 'deadline': return d.rolling ? { value: 'rolling' } : { value: d.date || null, text: d.date ? fmtDate(d.date) : undefined };
    case 'daterange': return d.start ? { value: { start: d.start, end: d.end || null }, text: `${fmtDate(d.start)}${d.end ? ` – ${fmtDate(d.end)}` : ''}` } : { value: null };
    case 'enum': return { value: d || null };
    default: return { value: String(d || '').trim() || null };
  }
}

export function FieldInput({ def, draft, setDraft, autoFocus }) {
  switch (def.type) {
    case 'longtext':
      return <textarea class="textarea" rows={5} value={draft} autoFocus={autoFocus} onInput={(e) => setDraft(e.currentTarget.value)} />;
    case 'enum':
      return <Select value={draft} onChange={setDraft} options={[{ value: '', label: '— not set —' }, ...def.options.map((o) => ({ value: o, label: o }))]} />;
    case 'list':
      return <TagInput value={draft} onChange={setDraft} suggestions={SUGGEST[def.key] || []} />;
    case 'date':
      return <input class="input" type="date" value={draft} autoFocus={autoFocus} onInput={(e) => setDraft(e.currentTarget.value)} />;
    case 'deadline':
      return (
        <div class="inline-fields">
          <input class="input" type="date" disabled={draft.rolling} value={draft.date} autoFocus={autoFocus} onInput={(e) => setDraft({ ...draft, date: e.currentTarget.value })} />
          <label class="check"><input type="checkbox" checked={draft.rolling} onChange={(e) => setDraft({ ...draft, rolling: e.currentTarget.checked })} /> Rolling / no deadline</label>
        </div>
      );
    case 'daterange':
      return (
        <div class="inline-fields">
          <input class="input" type="date" value={draft.start} onInput={(e) => setDraft({ ...draft, start: e.currentTarget.value })} />
          <span class="muted">to</span>
          <input class="input" type="date" value={draft.end} onInput={(e) => setDraft({ ...draft, end: e.currentTarget.value })} />
        </div>
      );
    case 'money':
      return (
        <div class="inline-fields">
          <input class="input input-num" type="number" min="0" step="0.01" disabled={draft.free} value={draft.amount} autoFocus={autoFocus} onInput={(e) => setDraft({ ...draft, amount: e.currentTarget.value })} />
          <Select value={draft.currency} onChange={(c) => setDraft({ ...draft, currency: c })} options={CURRENCIES} disabled={draft.free} />
          <label class="check"><input type="checkbox" checked={draft.free} onChange={(e) => setDraft({ ...draft, free: e.currentTarget.checked })} /> Free</label>
        </div>
      );
    default:
      return <input class="input" type={def.type === 'url' ? 'url' : 'text'} value={draft} autoFocus={autoFocus} onInput={(e) => setDraft(e.currentTarget.value)} />;
  }
}

export function FieldEditor({ def, fv, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => initialDraft(def, fv));
  return (
    <form class="field-editor" onSubmit={(e) => { e.preventDefault(); onSave(draftToValue(def, draft)); }}>
      <FieldInput def={def} draft={draft} setDraft={setDraft} autoFocus />
      <div class="field-editor-actions">
        <Button kind="primary" small type="submit">Save</Button>
        <Button small onClick={onCancel}>Cancel</Button>
        <span class="hint">Saved as entered by you; re-checks won’t overwrite it.</span>
      </div>
    </form>
  );
}
