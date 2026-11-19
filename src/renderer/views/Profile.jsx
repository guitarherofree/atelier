// Your artist profile and priorities: used (only on this Mac) to judge how each opportunity fits.
import { Plus, Trash2, X } from 'lucide-preact';
import { data, call, confirmDialog } from '../lib/store.js';
import { DISCIPLINES } from '../../shared/schema.mjs';
import { REGIONS, COUNTRIES, US_STATES } from '../../shared/geo.mjs';
import { FIT_CRITERIA, DEFAULT_WEIGHTS } from '../../shared/fit.mjs';
import { Button, IconButton, Section, FormRow, TextInput, TextArea, TagInput, Select } from '../components/Common.jsx';

const PLACES = [...COUNTRIES.map((c) => c.name), ...US_STATES.map(([n]) => n)];
const WEIGHT_LABELS = ['Ignore', 'A little', 'Matters', 'Very important'];

export function Profile() {
  const p = data.value.profile;
  const prefs = p.prefs || {};
  const upd = (patch) => call('profile:update', patch);
  const setPref = (k, v) => upd({ prefs: { [k]: v } });
  const weights = { ...DEFAULT_WEIGHTS, ...(p.weights || {}) };
  const contacts = data.value.contacts;
  const unavailable = prefs.unavailable || [];
  return (
    <div class="page">
      <header class="page-head"><div><h1>Artist Profile</h1><p class="page-sub">Used to explain how each opportunity fits you. It stays on this Mac; AI requests (if you turn them on) include only the parts they need.</p></div></header>

      <Section title="About you">
        <FormRow label="Name"><TextInput value={p.name} onSave={(v) => upd({ name: v })} /></FormRow>
        <FormRow label="Website"><TextInput value={p.website} onSave={(v) => upd({ website: v })} placeholder="https://" /></FormRow>
        <FormRow label="Based in" hint="City, state/region, country"><TextInput value={p.basedIn} onSave={(v) => upd({ basedIn: v })} placeholder="Atlanta, Georgia, United States" /></FormRow>
        <FormRow label="Citizenship and residency" hint="Countries or US states that eligibility rules may ask about"><TagInput value={p.countries || []} onChange={(v) => upd({ countries: v })} suggestions={PLACES} placeholder="United States, Georgia…" /></FormRow>
        <FormRow label="Languages"><TagInput value={p.languages || []} onChange={(v) => upd({ languages: v })} suggestions={['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese']} /></FormRow>
        <FormRow label="Career stage">
          <Select value={p.careerStage || ''} onChange={(v) => upd({ careerStage: v })} options={[{ value: '', label: 'Not set' }, { value: 'emerging', label: 'Emerging' }, { value: 'mid-career', label: 'Mid-career' }, { value: 'established', label: 'Established' }]} />
        </FormRow>
        <FormRow label="Birth year" hint="Optional. Only used to check age limits; never sent to AI.">
          <TextInput type="number" value={p.birthYear || ''} onSave={(v) => upd({ birthYear: v ? Number(v) : null })} class="input-num" />
        </FormRow>
        <FormRow label="Currently a student"><label class="check"><input type="checkbox" checked={!!p.isStudent} onChange={(e) => upd({ isStudent: e.currentTarget.checked })} /> Yes</label></FormRow>
      </Section>

      <Section title="Your practice">
        <FormRow label="Disciplines"><TagInput value={p.disciplines || []} onChange={(v) => upd({ disciplines: v })} suggestions={DISCIPLINES} /></FormRow>
        <FormRow label="Mediums and tools" hint="e.g. electric guitar, field recording, microtonal tuning"><TagInput value={p.mediums || []} onChange={(v) => upd({ mediums: v })} /></FormRow>
        <FormRow label="Themes" hint="Words that describe what your work is about"><TagInput value={p.themes || []} onChange={(v) => upd({ themes: v })} /></FormRow>
      </Section>

      <Section title="Goals" hint="What you want from residencies and grants right now. Words here are matched against each call.">
        <TextArea value={p.goals} rows={4} onSave={(v) => upd({ goals: v })} placeholder="e.g. Time to compose and record a new album; access to a studio with good acoustics; meet other sound artists." showCount={false} />
        <FormRow label="Goal keywords" hint="Matched against opportunity text"><TagInput value={p.goalTags || []} onChange={(v) => upd({ goalTags: v })} suggestions={['recording', 'studio', 'composition', 'collaboration', 'community', 'exhibition', 'performance', 'research', 'teaching', 'international', 'nature', 'solitude']} /></FormRow>
      </Section>

      <Section title="Preferences">
        <FormRow label="Funding">
          <Select value={prefs.funding || 'prefer-funded'} onChange={(v) => setPref('funding', v)} options={[{ value: 'any', label: 'Open to anything' }, { value: 'prefer-funded', label: 'Prefer funded (stipend, travel, housing)' }, { value: 'funded-only', label: 'Funded only' }]} />
        </FormRow>
        <FormRow label="Highest application fee" hint="Leave blank for no limit">
          <div class="inline-fields">
            <TextInput type="number" value={prefs.maxApplicationFee ?? ''} onSave={(v) => setPref('maxApplicationFee', v === '' ? null : Number(v))} class="input-num" />
            <Select value={prefs.currency || 'USD'} onChange={(v) => setPref('currency', v)} options={['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'AUD']} />
          </div>
        </FormRow>
        <FormRow label="Highest program fee you’d pay" hint="Residencies that charge artists"><TextInput type="number" value={prefs.maxProgramFee ?? ''} onSave={(v) => setPref('maxProgramFee', v === '' ? null : Number(v))} class="input-num" /></FormRow>
        <FormRow label="Formats">
          <div class="inline-fields">
            {['In person', 'Online', 'Hybrid'].map((f) => (
              <label class="check"><input type="checkbox" checked={(prefs.formats || []).includes(f)} onChange={(e) => setPref('formats', e.currentTarget.checked ? [...(prefs.formats || []), f] : (prefs.formats || []).filter((x) => x !== f))} /> {f}</label>
            ))}
          </div>
        </FormRow>
        <FormRow label="Preferred regions"><TagInput value={prefs.preferRegions || []} onChange={(v) => setPref('preferRegions', v)} suggestions={[...REGIONS, ...PLACES]} /></FormRow>
        <FormRow label="Regions to avoid"><TagInput value={prefs.avoidRegions || []} onChange={(v) => setPref('avoidRegions', v)} suggestions={[...REGIONS, ...PLACES]} /></FormRow>
        <FormRow label="Length of stay" hint="In weeks">
          <div class="inline-fields">
            <TextInput type="number" value={prefs.minWeeks ?? ''} onSave={(v) => setPref('minWeeks', v === '' ? null : Number(v))} class="input-num" placeholder="min" />
            <span class="muted">to</span>
            <TextInput type="number" value={prefs.maxWeeks ?? ''} onSave={(v) => setPref('maxWeeks', v === '' ? null : Number(v))} class="input-num" placeholder="max" />
          </div>
        </FormRow>
        <FormRow label="When you’re unavailable" hint="Atelier warns when program dates overlap">
          <div>
            {unavailable.map((u, i) => (
              <div class="inline-fields">
                <input class="input" type="date" value={u.from || ''} onChange={(e) => setPref('unavailable', unavailable.map((x, j) => (j === i ? { ...x, from: e.currentTarget.value } : x)))} />
                <span class="muted">to</span>
                <input class="input" type="date" value={u.to || ''} onChange={(e) => setPref('unavailable', unavailable.map((x, j) => (j === i ? { ...x, to: e.currentTarget.value } : x)))} />
                <input class="input" value={u.label || ''} placeholder="Why (optional)" onChange={(e) => setPref('unavailable', unavailable.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)))} />
                <IconButton icon={X} label="Remove" onClick={() => setPref('unavailable', unavailable.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button small icon={Plus} onClick={() => setPref('unavailable', [...unavailable, { from: '', to: '', label: '' }])}>Add dates</Button>
          </div>
        </FormRow>
        <FormRow label="Things you need" hint="Atelier checks whether each call mentions them"><TagInput value={prefs.needs || []} onChange={(v) => setPref('needs', v)} suggestions={['recording studio', 'piano', 'private studio', 'accessible housing', 'family friendly', 'internet', 'quiet', 'car not required']} /></FormRow>
      </Section>

      <Section title="What matters most" hint="How much each check counts toward the fit rating.">
        <div class="weights">
          {FIT_CRITERIA.map((c) => (
            <div class="weight-row">
              <span>{c.label}</span>
              <input type="range" min="0" max="3" step="1" value={weights[c.key]} onChange={(e) => upd({ weights: { [c.key]: Number(e.currentTarget.value) } })} />
              <span class="muted small">{WEIGHT_LABELS[weights[c.key]]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recommenders" hint="People you can ask for letters. Used in application Letters tabs." actions={<Button small icon={Plus} onClick={() => call('col:create', 'contacts', { name: 'New recommender', email: '', role: '', notes: '' })}>Add</Button>}>
        {contacts.map((c) => (
          <div class="contact-row">
            <TextInput value={c.name} onSave={(v) => call('col:update', 'contacts', c.id, { name: v })} placeholder="Name" />
            <TextInput value={c.email} onSave={(v) => call('col:update', 'contacts', c.id, { email: v })} placeholder="Email" type="email" />
            <TextInput value={c.role} onSave={(v) => call('col:update', 'contacts', c.id, { role: v })} placeholder="Relationship (e.g. former professor)" />
            <IconButton icon={Trash2} label="Delete" onClick={async () => { if (await confirmDialog(`Delete ${c.name}?`, 'They’ll be removed from any applications too.', { confirmLabel: 'Delete', destructive: true })) call('col:delete', 'contacts', c.id); }} />
          </div>
        ))}
        {!contacts.length && <p class="muted">No recommenders yet.</p>}
      </Section>
    </div>
  );
}
