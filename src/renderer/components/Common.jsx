// Small building blocks used across the app.
import { useState, useEffect, useRef } from 'preact/hooks';
import { TriangleAlert, Check, X, Globe, MapPin, Clock, CircleHelp, Info } from 'lucide-preact';
import { fieldStatus, ORIGIN_LABELS, hostOf, wordCount, charCount, deadlineOf, moneyText } from '../../shared/schema.mjs';
import { VERDICT_LABELS } from '../../shared/fit.mjs';
import { ago, fmtDate, countdown } from '../lib/format.js';
import { data } from '../lib/store.js';

export function Button({ kind = 'secondary', small, icon: Icon, children, class: cls = '', ...rest }) {
  return (
    <button type="button" class={`btn btn-${kind}${small ? ' btn-sm' : ''} ${cls}`} {...rest}>
      {Icon && <Icon size={small ? 13 : 15} strokeWidth={1.8} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, class: cls = '', size = 15, ...rest }) {
  return (
    <button type="button" class={`icon-btn ${cls}`} aria-label={label} title={label} {...rest}>
      <Icon size={size} strokeWidth={1.8} />
    </button>
  );
}

export function Badge({ tone = 'muted', children, title, icon: Icon }) {
  return <span class={`badge tone-${tone}`} title={title}>{Icon && <Icon size={11} strokeWidth={2} />}{children}</span>;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div class="empty">
      {Icon && <Icon size={30} strokeWidth={1.3} />}
      <h3>{title}</h3>
      {children && <div class="empty-body">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((t) => (
        <button type="button" role="tab" aria-selected={value === t.key} class={`tab${value === t.key ? ' active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && t.count !== 0 && <span class="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label class={`toggle${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="toggle-track"><span class="toggle-thumb" /></span>
      {(label || hint) && <span class="toggle-text">{label}{hint && <small>{hint}</small>}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, class: cls = '', ...rest }) {
  return (
    <select class={`select ${cls}`} value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)} {...rest}>
      {options.map((o) => (typeof o === 'string' ? <option value={o}>{o}</option> : <option value={o.value} disabled={o.disabled}>{o.label}</option>))}
    </select>
  );
}

/** A text input that saves when you leave it (or press Return), not on every keystroke. */
export function TextInput({ value, onSave, placeholder, type = 'text', class: cls = '', autoFocus, ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = (el) => { const cur = el ? el.value : v; if ((cur ?? '') !== (value ?? '')) onSave(cur); };
  return (
    <input class={`input ${cls}`} type={type} value={v} placeholder={placeholder} autoFocus={autoFocus}
      onInput={(e) => setV(e.currentTarget.value)} onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => { if (e.key === 'Enter' && type !== 'textarea') { e.currentTarget.blur(); } if (e.key === 'Escape') { setV(value ?? ''); } }} {...rest} />
  );
}

/** A textarea with word and character counts; saves after a pause and on blur. */
export function TextArea({ value, onSave, placeholder, rows = 5, limit, class: cls = '', showCount = true, hint }) {
  const [v, setV] = useState(value ?? '');
  const timer = useRef();
  const last = useRef(value ?? '');
  useEffect(() => { if ((value ?? '') !== last.current) { setV(value ?? ''); last.current = value ?? ''; } }, [value]);
  const save = (text) => { if (text !== last.current) { last.current = text; onSave(text); } };
  const words = wordCount(v);
  const chars = charCount(v);
  const over = (limit?.words && words > limit.words) || (limit?.chars && chars > limit.chars);
  return (
    <div class={`textarea-wrap ${cls}`}>
      <textarea class="textarea" rows={rows} value={v} placeholder={placeholder}
        onInput={(e) => { const t = e.currentTarget.value; setV(t); clearTimeout(timer.current); timer.current = setTimeout(() => save(t), 700); }}
        onBlur={(e) => { clearTimeout(timer.current); save(e.currentTarget.value); }} />
      {(showCount || hint) && (
        <div class="textarea-foot">
          <span class="hint">{hint}</span>
          {showCount && <span class={`count${over ? ' over' : ''}`}>{words} words · {chars} characters{limit?.words ? ` / ${limit.words} words` : limit?.chars ? ` / ${limit.chars} characters` : ''}</span>}
        </div>
      )}
    </div>
  );
}

/** Tags with suggestions. */
export function TagInput({ value = [], onChange, suggestions = [], placeholder = 'Add…' }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const add = (t) => {
    const s = String(t || '').trim();
    if (!s || value.some((x) => x.toLowerCase() === s.toLowerCase())) { setText(''); return; }
    onChange([...value, s]);
    setText('');
  };
  const filtered = suggestions.filter((s) => !value.includes(s) && (!text || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 8);
  return (
    <div class="tag-input">
      {value.map((t) => (
        <span class="tag">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={11} /></button></span>
      ))}
      <input value={text} placeholder={value.length ? '' : placeholder}
        onInput={(e) => { setText(e.currentTarget.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => { setOpen(false); if (text.trim()) add(text); }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }} />
      {open && filtered.length > 0 && (
        <div class="tag-suggest">{filtered.map((s) => <button type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }}>{s}</button>)}</div>
      )}
    </div>
  );
}

export function FormRow({ label, hint, children, wide }) {
  return (
    <div class={`form-row${wide ? ' wide' : ''}`}>
      <div class="form-label">{label}{hint && <small>{hint}</small>}</div>
      <div class="form-control">{children}</div>
    </div>
  );
}

export function Section({ title, children, actions, hint }) {
  return (
    <section class="section">
      {(title || actions) && <div class="section-head"><div><h2>{title}</h2>{hint && <p class="section-hint">{hint}</p>}</div><div class="section-actions">{actions}</div></div>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- opportunity badges

export function DeadlineBadge({ opp, long }) {
  const dl = deadlineOf(opp);
  if (dl.kind === 'rolling') return <Badge tone="info" icon={Clock}>Rolling</Badge>;
  if (dl.kind !== 'date') return <Badge tone="muted" icon={Clock}>No deadline found</Badge>;
  const tone = dl.days < 0 ? 'muted' : dl.days <= 7 ? 'bad' : dl.days <= 21 ? 'warn' : 'ok';
  const left = dl.days < 0 ? countdown(dl.date) : dl.days === 0 ? 'due today' : `${dl.days} day${dl.days === 1 ? '' : 's'} left`;
  return <Badge tone={tone} icon={Clock} title={fmtDate(dl.date)}>{long ? `${fmtDate(dl.date)} · ${left}` : countdown(dl.date)}</Badge>;
}

export function ModeBadge({ opp }) {
  const mode = opp.fields?.mode?.value;
  if (mode === 'Online') return <Badge tone="online" icon={Globe}>Online</Badge>;
  if (mode === 'Hybrid') return <Badge tone="online" icon={Globe}>Hybrid</Badge>;
  return null;
}

export function LocationText({ opp }) {
  const loc = opp.fields?.location?.value;
  const mode = opp.fields?.mode?.value;
  if (mode === 'Online') return <span class="loc"><Globe size={12} /> Online</span>;
  if (!loc) return null;
  return <span class="loc"><MapPin size={12} /> {loc}</span>;
}

export function FitBadge({ fit }) {
  if (!fit) return null;
  const tone = { strong: 'ok', possible: 'info', weak: 'warn', unlikely: 'bad', unknown: 'muted' }[fit.verdict];
  return <Badge tone={tone} title={fit.score != null ? `Fit score ${fit.score}/100` : ''}>{VERDICT_LABELS[fit.verdict]}</Badge>;
}

export function FeeText({ opp }) {
  const fee = opp.fields?.applicationFee?.value;
  if (!fee) return null;
  return <span class="fee">{fee.amount === 0 ? 'No fee' : `Fee ${moneyText(fee)}`}</span>;
}

const STATE_ICON = { conflict: TriangleAlert, missing: TriangleAlert, changed: TriangleAlert, stale: Clock, unverified: CircleHelp, confirmed: Check, manual: Check, empty: Info };

/** Where a detail came from, when it was last checked, and whether to verify it. */
export function Provenance({ fv, important, compact }) {
  const staleAfterDays = data.value.settings?.general?.staleAfterDays ?? 14;
  const st = fieldStatus(fv, { staleAfterDays, important });
  if (!fv) return null;
  const Icon = STATE_ICON[st.state] || Info;
  const src = fv.sourceUrl ? hostOf(fv.sourceUrl) : '';
  const checked = fv.checkedAt ? ago(fv.checkedAt) : '';
  const tip = [
    ORIGIN_LABELS[fv.origin] || fv.origin,
    src && `Source: ${fv.sourceUrl}`,
    fv.extractedAt && `Found ${fmtDate(fv.extractedAt)}`,
    fv.checkedAt && `Last checked ${fmtDate(fv.checkedAt)}`,
    fv.verifiedAt && fv.origin !== 'manual' && `Confirmed by you ${fmtDate(fv.verifiedAt)}`,
    fv.confidence != null && fv.origin !== 'manual' && `Confidence ${Math.round(fv.confidence * 100)}%`,
  ].filter(Boolean).join('\n');
  return (
    <span class={`prov tone-${st.tone}${compact ? ' compact' : ''}`} title={tip}>
      <Icon size={12} strokeWidth={2} />
      <span class="prov-label">{st.label}</span>
      {!compact && (src || checked) && <span class="prov-src">{src}{src && checked ? ' · ' : ''}{checked && `checked ${checked}`}</span>}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, wide, class: cls = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div class={`modal${wide ? ' wide' : ''} ${cls}`} role="dialog" aria-label={title}>
        <div class="modal-head"><h2>{title}</h2><IconButton icon={X} label="Close" onClick={onClose} /></div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label }) {
  return <span class="spinner-wrap"><span class="spinner" />{label && <span>{label}</span>}</span>;
}

export function Progress({ value, max }) {
  const pct = max ? Math.round((100 * value) / max) : 0;
  return <span class="progress"><span style={{ width: `${pct}%` }} /></span>;
}
