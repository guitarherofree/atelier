// Settings: background checks, AI, search, Instagram, map, calendar, updates, backups and privacy.
import { useState, useEffect } from 'preact/hooks';
import { RefreshCw, Download, KeyRound, FolderOpen, Archive, Upload, ShieldCheck, Sparkles, FileText } from 'lucide-preact';
import { data, meta, updates, call, refreshSecrets, toast } from '../lib/store.js';
import { Button, Section, FormRow, Select, Toggle, TextInput, Badge } from '../components/Common.jsx';
import { ago, bytes, fmtDate } from '../lib/format.js';

const SECTIONS = [
  ['general', 'General'], ['ai', 'AI'], ['search', 'Search'], ['instagram', 'Instagram'], ['map', 'Map'], ['calendar', 'Calendar'],
  ['updates', 'Updates'], ['backups', 'Backups & export'], ['privacy', 'Privacy'],
];

function SecretField({ name, placeholder, help }) {
  const has = meta.value.secrets?.[name];
  const [v, setV] = useState('');
  return (
    <div class="secret">
      {has ? <Badge tone="ok" icon={KeyRound}>Saved in your Keychain</Badge> : <Badge tone="muted">Not set</Badge>}
      <input class="input mono" type="password" value={v} placeholder={has ? 'Replace…' : placeholder} onInput={(e) => setV(e.currentTarget.value)} />
      <Button small disabled={!v.trim()} onClick={async () => { await call('secrets:set', name, v.trim()); setV(''); await refreshSecrets(); toast('Saved in your Keychain', 'success'); }}>Save</Button>
      {has && <Button small kind="ghost" onClick={async () => { await call('secrets:clear', name); await refreshSecrets(); }}>Remove</Button>}
      {help && <div class="muted small">{help}</div>}
    </div>
  );
}

function General({ s, set }) {
  const g = s.general || {};
  return (
    <Section title="General">
      <FormRow label="Re-check saved opportunities" hint="Atelier revisits each saved page to catch changed deadlines, fees or rules">
        <Select value={String(g.recheckEveryDays ?? 3)} onChange={(v) => set({ general: { recheckEveryDays: Number(v) } })} options={[{ value: '1', label: 'Every day' }, { value: '3', label: 'Every 3 days' }, { value: '7', label: 'Every week' }, { value: '14', label: 'Every 2 weeks' }, { value: '0', label: 'Only when I ask' }]} />
      </FormRow>
      <FormRow label="Flag details for verification after" hint="A detail not re-checked for this long gets a “Not rechecked lately” flag">
        <Select value={String(g.staleAfterDays ?? 14)} onChange={(v) => set({ general: { staleAfterDays: Number(v) } })} options={['7', '14', '30', '60'].map((d) => ({ value: d, label: `${d} days` }))} />
      </FormRow>
      <FormRow label="Look for new opportunities" hint="Runs your sources in the background while Atelier is open">
        <Select value={String(g.discoverEveryHours ?? 0)} onChange={(v) => set({ general: { discoverEveryHours: Number(v) } })} options={[{ value: '0', label: 'Only when I click Find new' }, { value: '24', label: 'Once a day' }, { value: '72', label: 'Every 3 days' }, { value: '168', label: 'Once a week' }]} />
      </FormRow>
      <FormRow label="New opportunities per source per run"><Select value={String(g.newPerSourceLimit ?? 25)} onChange={(v) => set({ general: { newPerSourceLimit: Number(v) } })} options={['10', '25', '50', '100'].map((n) => ({ value: n, label: n }))} /></FormRow>
      <FormRow label="Notifications"><Toggle checked={g.notifyChanges !== false} onChange={(v) => set({ general: { notifyChanges: v } })} label="Tell me when a saved opportunity’s deadline, fee or rules change" /></FormRow>
      <FormRow label="Week starts on"><Select value={String(g.weekStartsOn ?? 0)} onChange={(v) => set({ general: { weekStartsOn: Number(v) } })} options={[{ value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }]} /></FormRow>
    </Section>
  );
}

function Ai({ s, set }) {
  const ai = s.ai || {};
  const [log, setLog] = useState(null);
  const [testing, setTesting] = useState(false);
  return (
    <Section title="AI assistance" hint="Optional. Off by default. Used only when you click an AI button: reading a page, explaining fit, tailoring a proposal, drafting or shortening an answer, or searching the web.">
      <FormRow label="Provider">
        <Select value={ai.provider || 'off'} onChange={(v) => set({ ai: { provider: v } })} options={[
          { value: 'off', label: 'Off — everything stays on this Mac' },
          { value: 'ollama', label: 'Ollama — a model running on this Mac' },
          { value: 'anthropic', label: 'Claude — Anthropic API with your key' },
          { value: 'openai', label: 'Another OpenAI-compatible server' },
        ]} />
      </FormRow>
      {ai.provider === 'anthropic' && (
        <>
          <FormRow label="API key" hint="From console.anthropic.com. Stored in your macOS Keychain."><SecretField name="anthropic" placeholder="sk-ant-…" /></FormRow>
          <FormRow label="Model"><TextInput value={ai.anthropic?.model} onSave={(v) => set({ ai: { anthropic: { model: v.trim() } } })} class="mono" /></FormRow>
          <FormRow label="Web search tool" hint="Advanced: the tool version used for “Search with Claude”"><TextInput value={ai.anthropic?.webSearchTool} onSave={(v) => set({ ai: { anthropic: { webSearchTool: v.trim() } } })} class="mono" /></FormRow>
        </>
      )}
      {ai.provider === 'ollama' && (
        <>
          <FormRow label="Address"><TextInput value={ai.ollama?.baseUrl} onSave={(v) => set({ ai: { ollama: { baseUrl: v.trim() } } })} class="mono" /></FormRow>
          <FormRow label="Model" hint="Any model you’ve pulled with `ollama pull`"><TextInput value={ai.ollama?.model} onSave={(v) => set({ ai: { ollama: { model: v.trim() } } })} class="mono" /></FormRow>
        </>
      )}
      {ai.provider === 'openai' && (
        <>
          <FormRow label="Address" hint="Ends in /v1"><TextInput value={ai.openai?.baseUrl} onSave={(v) => set({ ai: { openai: { baseUrl: v.trim() } } })} class="mono" /></FormRow>
          <FormRow label="Model"><TextInput value={ai.openai?.model} onSave={(v) => set({ ai: { openai: { model: v.trim() } } })} class="mono" /></FormRow>
          <FormRow label="API key" hint="If the server needs one"><SecretField name="openai" placeholder="key" /></FormRow>
        </>
      )}
      {ai.provider !== 'off' && (
        <FormRow label="">
          <div class="inline-fields">
            <Button icon={Sparkles} disabled={testing} onClick={async () => { setTesting(true); const r = await call('ai:test'); setTesting(false); if (r?.ok) toast(`Connected: “${r.reply}”`, 'success'); }}>{testing ? 'Testing…' : 'Test connection'}</Button>
            <Button kind="ghost" icon={FileText} onClick={async () => setLog(await call('ai:log'))}>Show activity</Button>
            {Object.keys(ai.consented || {}).length > 0 && <Button kind="ghost" onClick={() => set({ ai: { consented: Object.fromEntries(Object.keys(ai.consented).map((k) => [k, null])) } })}>Ask me again before sending</Button>}
          </div>
        </FormRow>
      )}
      {log && (
        <table class="mini-table">
          <thead><tr><th>When</th><th>Provider</th><th>For</th><th>Sent</th><th /></tr></thead>
          <tbody>{log.slice(0, 50).map((l) => <tr><td>{fmtDate(l.at, { dateStyle: 'short', timeStyle: 'short' })}</td><td>{l.provider}</td><td>{l.purpose}</td><td>{l.charsSent?.toLocaleString()} chars</td><td class={l.ok ? 'tone-ok' : 'tone-bad'}>{l.ok ? 'OK' : l.error}</td></tr>)}</tbody>
        </table>
      )}
    </Section>
  );
}

function Search({ s, set }) {
  return (
    <Section title="Searching beyond your sources">
      <FormRow label="Search with">
        <Select value={s.search?.provider || 'browser'} onChange={(v) => set({ search: { provider: v } })} options={[
          { value: 'browser', label: 'The Atelier browser (you browse, then Capture)' },
          { value: 'brave', label: 'Brave Search API (results listed in Atelier)' },
          { value: 'claude', label: 'Claude with web search (needs the Claude provider in AI)' },
        ]} />
      </FormRow>
      <FormRow label="Search engine in the browser"><Select value={s.search?.engine || 'duckduckgo'} onChange={(v) => set({ search: { engine: v } })} options={[{ value: 'duckduckgo', label: 'DuckDuckGo' }, { value: 'google', label: 'Google' }, { value: 'bing', label: 'Bing' }, { value: 'brave', label: 'Brave' }]} /></FormRow>
      <FormRow label="Brave Search API key" hint="Free tier available at api-dashboard.search.brave.com"><SecretField name="brave" placeholder="BSA…" /></FormRow>
    </Section>
  );
}

function Instagram({ s, set }) {
  const ig = s.instagram || {};
  return (
    <Section title="Instagram #artistresidency" hint="Instagram only allows hashtag search through Meta’s Graph API, for apps Meta has approved. Choose what fits the access you have.">
      <FormRow label="Mode">
        <Select value={ig.mode || 'off'} onChange={(v) => set({ instagram: { mode: v } })} options={[
          { value: 'off', label: 'Off' },
          { value: 'browser', label: 'Browse and capture — sign in to Instagram in the Atelier browser' },
          { value: 'graph', label: 'Graph API — automatic, needs an approved Meta app' },
        ]} />
      </FormRow>
      <FormRow label="Hashtags"><TextInput value={(ig.hashtags || []).join(', ')} onSave={(v) => set({ instagram: { hashtags: v.split(/[,\s]+/).map((x) => x.replace(/^#/, '')).filter(Boolean) } })} /></FormRow>
      {ig.mode === 'graph' && (
        <>
          <FormRow label="Instagram account ID" hint="Your Instagram professional account’s ID (from Meta’s Graph API Explorer)"><TextInput value={ig.igUserId} onSave={(v) => set({ instagram: { igUserId: v.trim() } })} class="mono" /></FormRow>
          <FormRow label="Access token" hint="Needs instagram_basic and the Instagram Public Content Access feature. Meta allows 30 different hashtags per 7 days."><SecretField name="instagram" placeholder="EAAG…" /></FormRow>
          <FormRow label="Graph API version"><TextInput value={ig.apiVersion} onSave={(v) => set({ instagram: { apiVersion: v.trim() } })} class="mono" /></FormRow>
        </>
      )}
      {ig.mode !== 'off' && <FormRow label=""><Button onClick={() => call('instagram:browse')}>Open #{(ig.hashtags || ['artistresidency'])[0]} in the Atelier browser</Button></FormRow>}
    </Section>
  );
}

function MapSettings({ s, set }) {
  return (
    <Section title="Map">
      <FormRow label="Location lookups" hint="Sends only an opportunity’s location text (e.g. “Lisbon, Portugal”) to OpenStreetMap’s Nominatim service, then remembers the answer on this Mac.">
        <Toggle checked={s.map?.geocode !== false} onChange={(v) => set({ map: { geocode: v } })} label="Look up locations automatically when I ask" />
      </FormRow>
      <p class="muted small">Map images come from CARTO and OpenStreetMap. With lookups off, place opportunities by hand on the Map page.</p>
    </Section>
  );
}

function CalendarSettings({ s, set }) {
  const c = s.calendar || {};
  return (
    <Section title="Calendar export">
      <FormRow label="Reminders" hint="Before deadlines, your target dates and letter due dates (at 9 AM)">
        <Select value={(c.alarmsDaysBefore || [7, 1]).join(',')} onChange={(v) => set({ calendar: { alarmsDaysBefore: v ? v.split(',').map(Number) : [] } })} options={[{ value: '14,3', label: '2 weeks and 3 days before' }, { value: '7,1', label: '1 week and 1 day before' }, { value: '3', label: '3 days before' }, { value: '1', label: '1 day before' }, { value: '', label: 'No reminders' }]} />
      </FormRow>
    </Section>
  );
}

function Updates({ s, set }) {
  const u = updates.value;
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(null);
  useEffect(() => { call('updates:hasToken').then(setHasToken); }, [u.state]);
  const lastCheck = data.value && u.current;
  return (
    <Section title="Updates" hint={`You have Atelier ${meta.value.version}. New versions come from your private GitHub repository’s releases.`}>
      <div class="update-box">
        {u.state === 'checking' && <p>Checking…</p>}
        {u.state === 'up-to-date' && <p>Atelier is up to date{u.note ? ` — ${u.note}` : '.'}</p>}
        {u.state === 'available' && (
          <div>
            <p><b>Atelier {u.latest?.version}</b> is available{u.latest?.publishedAt ? ` (released ${fmtDate(u.latest.publishedAt)})` : ''}.</p>
            {u.latest?.notes && <pre class="release-notes">{u.latest.notes}</pre>}
            <div class="inline-fields"><Button kind="primary" icon={Download} onClick={() => call('updates:download')}>Download and install</Button><Button kind="ghost" onClick={() => call('updates:skip', u.latest.version)}>Skip this version</Button></div>
          </div>
        )}
        {u.state === 'downloading' && <p>Downloading {u.latest?.version}… {Math.round((u.progress || 0) * 100)}%</p>}
        {u.state === 'ready' && <div><p>Atelier {u.latest?.version} is ready.</p><Button kind="primary" onClick={() => call('updates:install')}>Restart to update</Button></div>}
        {u.state === 'installing' && <p>Installing… Atelier will reopen.</p>}
        {u.state === 'error' && <p class="tone-bad">{u.error}</p>}
        {(u.state === 'needs-token' || u.state === 'bad-token') && <p class={u.state === 'bad-token' ? 'tone-bad' : ''}>{u.state === 'bad-token' ? u.error : 'The repository is private, so Atelier needs a GitHub token to see its releases.'}</p>}
        <Button icon={RefreshCw} onClick={() => call('updates:check')} disabled={u.state === 'checking' || u.state === 'downloading'}>Check for updates</Button>
      </div>
      <FormRow label="Automatic checks"><Toggle checked={s.updates?.checkAutomatically !== false} onChange={(v) => set({ updates: { checkAutomatically: v } })} label="Check in the background" /></FormRow>
      <FormRow label="How often"><Select value={String(s.updates?.checkEveryHours ?? 24)} onChange={(v) => set({ updates: { checkEveryHours: Number(v) } })} options={[{ value: '6', label: 'Every 6 hours' }, { value: '24', label: 'Daily' }, { value: '72', label: 'Every 3 days' }, { value: '168', label: 'Weekly' }]} /></FormRow>
      <FormRow label="GitHub token" hint="Fine-grained token with read-only Contents access to guitarherofree/atelier. Stored in your Keychain.">
        <div class="secret">
          {hasToken ? <Badge tone="ok" icon={KeyRound}>Saved</Badge> : <Badge tone="muted">Not set</Badge>}
          <input class="input mono" type="password" value={token} placeholder="github_pat_…" onInput={(e) => setToken(e.currentTarget.value)} />
          <Button small disabled={!token.trim()} onClick={async () => { await call('updates:setToken', token.trim()); setToken(''); setHasToken(true); }}>Save and check</Button>
          {hasToken && <Button small kind="ghost" onClick={async () => { await call('updates:clearToken'); setHasToken(false); }}>Remove</Button>}
        </div>
      </FormRow>
    </Section>
  );
}

function Backups({ s, set }) {
  const [list, setList] = useState([]);
  const load = () => call('backup:list').then((l) => setList(Array.isArray(l) ? l : []));
  useEffect(() => { load(); }, []);
  const b = s.backups || {};
  return (
    <Section title="Backups & export" hint="Your profile, opportunities, applications, proposals and portfolio details live only on this Mac. Back them up.">
      <div class="inline-fields wrap">
        <Button kind="primary" icon={Archive} onClick={async () => { await call('backup:now'); load(); }}>Back up now</Button>
        <Button icon={Archive} onClick={() => call('backup:to')}>Back up everything (with files) to…</Button>
        <Button icon={Upload} onClick={() => call('backup:restore')}>Restore from a backup…</Button>
        <Button icon={FileText} onClick={() => call('backup:export')}>Export readable data…</Button>
        <Button kind="ghost" icon={FolderOpen} onClick={() => call('shell:showData')}>Show data folder</Button>
      </div>
      <FormRow label="Automatic backups"><Toggle checked={b.auto !== false} onChange={(v) => set({ backups: { auto: v } })} label="Back up once a day while Atelier is open" /></FormRow>
      <FormRow label="Keep" hint="Older automatic backups are removed"><Select value={String(b.keep ?? 14)} onChange={(v) => set({ backups: { keep: Number(v) } })} options={['7', '14', '30', '90'].map((n) => ({ value: n, label: `${n} backups` }))} /></FormRow>
      <FormRow label="Include portfolio files" hint="Makes automatic backups bigger"><Toggle checked={!!b.includePortfolioFiles} onChange={(v) => set({ backups: { includePortfolioFiles: v } })} label="Include images, video, audio and attachments" /></FormRow>
      <FormRow label="Backup folder" hint="Another drive or a synced folder protects against losing this Mac">
        <div class="inline-fields"><span class="mono small">{b.folder || meta.value.backups?.folder || 'Inside Atelier’s data folder'}</span><Button small onClick={async () => { await call('backup:chooseFolder'); load(); }}>Choose…</Button>{b.folder && <Button small kind="ghost" onClick={() => set({ backups: { folder: null } })}>Use default</Button>}</div>
      </FormRow>
      <h4>Recent backups</h4>
      <ul class="backup-list">
        {list.slice(0, 12).map((x) => (
          <li><span>{fmtDate(x.at, { dateStyle: 'medium', timeStyle: 'short' })}</span><span class="muted small">{bytes(x.size)}{x.auto ? ' · automatic' : ''}</span><span class="spacer" />
            <Button small kind="ghost" onClick={() => call('backup:reveal', x.file)}>Show</Button><Button small kind="ghost" onClick={() => call('backup:restore', x.file)}>Restore…</Button></li>
        ))}
        {!list.length && <li class="muted">No backups yet.</li>}
      </ul>
      <p class="muted small">API keys and tokens are never in backups or exports; they stay in your Keychain.</p>
    </Section>
  );
}

function Privacy() {
  const ai = meta.value.ai;
  return (
    <Section title="Privacy" hint="What leaves this Mac, and when.">
      <ul class="privacy-list">
        <li><ShieldCheck size={14} /> <b>Your profile, applications, proposals, portfolio and notes</b> are stored only in Atelier’s data folder on this Mac.</li>
        <li><ShieldCheck size={14} /> <b>Reading sources and pages</b>: Atelier downloads public web pages (and pages you can see when signed in through the Atelier browser). It sends nothing about you to those sites.</li>
        <li><ShieldCheck size={14} /> <b>AI</b>: {ai.provider === 'off' ? 'off.' : `${ai.label}${ai.leavesMac ? ` — text for the action you click goes to ${ai.destination}` : ' — runs on this Mac'}. Every request is listed in Settings › AI › Show activity.`}</li>
        <li><ShieldCheck size={14} /> <b>Map</b>: location names are looked up with OpenStreetMap when you ask; map tiles load from CARTO.</li>
        <li><ShieldCheck size={14} /> <b>Submitting</b>: Atelier never submits an application. After you confirm a review it opens the organizer’s form for you; recommendation requests open in Mail for you to send.</li>
        <li><ShieldCheck size={14} /> <b>Updates</b>: Atelier asks GitHub for new releases of your private repository using your token.</li>
        <li><ShieldCheck size={14} /> <b>Secrets</b> (API keys, tokens) live in the macOS Keychain.</li>
      </ul>
      <Button kind="ghost" onClick={() => call('log:show')}>Show activity log</Button>
    </Section>
  );
}

export function Settings({ section = 'general' }) {
  const s = data.value.settings;
  const set = (patch) => call('settings:update', patch);
  const [cur, setCur] = useState(section || 'general');
  useEffect(() => { if (section) setCur(section); }, [section]);
  const C = { general: General, ai: Ai, search: Search, instagram: Instagram, map: MapSettings, calendar: CalendarSettings, updates: Updates, backups: Backups, privacy: Privacy }[cur] || General;
  return (
    <div class="page">
      <header class="page-head"><div><h1>Settings</h1></div><div class="muted small">Atelier {meta.value.version}</div></header>
      <div class="settings">
        <nav class="settings-nav">{SECTIONS.map(([k, l]) => <button type="button" class={cur === k ? 'active' : ''} onClick={() => setCur(k)}>{l}</button>)}</nav>
        <div class="settings-body"><C s={s} set={set} /></div>
      </div>
    </div>
  );
}
