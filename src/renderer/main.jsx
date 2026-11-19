// Atelier — the window.
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import {
  Compass, Bookmark, ClipboardList, Calendar, Map as MapIcon, Image, PenLine, User, Rss, Settings as SettingsIcon, RefreshCw, Download, X,
} from 'lucide-preact';
import {
  init, ready, route, go, back, data, discovery, updates, toasts, modal, closeModal, openModal, call, meta, setRouteParams,
} from './lib/store.js';
import { ago } from './lib/format.js';
import { APP_STATUS_BY_KEY } from '../shared/schema.mjs';
import { Discover } from './views/Discover.jsx';
import { Opportunities } from './views/Opportunities.jsx';
import { OpportunityDetail } from './views/OpportunityDetail.jsx';
import { Applications } from './views/Applications.jsx';
import { ApplicationDetail } from './views/ApplicationDetail.jsx';
import { CalendarView } from './views/Calendar.jsx';
import { MapView } from './views/MapView.jsx';
import { Portfolio } from './views/Portfolio.jsx';
import { Writing } from './views/Writing.jsx';
import { Profile } from './views/Profile.jsx';
import { Sources } from './views/Sources.jsx';
import { Settings } from './views/Settings.jsx';
import { ModalHost } from './components/Modals.jsx';

const NAV = [
  { key: 'discover', label: 'Discover', icon: Compass },
  { key: 'opportunities', label: 'Opportunities', icon: Bookmark },
  { key: 'applications', label: 'Applications', icon: ClipboardList },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'map', label: 'Map', icon: MapIcon },
  { key: 'portfolio', label: 'Portfolio', icon: Image },
  { key: 'writing', label: 'Proposals & Text', icon: PenLine },
  { key: 'profile', label: 'Artist Profile', icon: User },
  { key: 'sources', label: 'Sources', icon: Rss },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

const PARENT = { opportunity: 'opportunities', application: 'applications' };

function Sidebar() {
  const d = data.value;
  const r = route.value;
  const active = PARENT[r.view] || r.view;
  const counts = {
    discover: d.opportunities.filter((o) => o.status === 'new').length,
    opportunities: d.opportunities.filter((o) => o.status === 'saved').length,
    applications: d.applications.filter((a) => APP_STATUS_BY_KEY[a.status]?.group === 'active').length,
  };
  const disc = discovery.value;
  const running = disc.running;
  const srcs = Object.values(disc.sources || {});
  const doneN = srcs.filter((s) => ['done', 'error'].includes(s.phase)).length;
  return (
    <nav class="sidebar">
      <div class="brand">Atelier</div>
      <ul class="nav">
        {NAV.map((n) => (
          <li>
            <button type="button" class={`nav-item${active === n.key ? ' active' : ''}`} onClick={() => go(n.key)}>
              <n.icon size={16} strokeWidth={1.7} />
              <span>{n.label}</span>
              {counts[n.key] > 0 && <span class="nav-count">{counts[n.key]}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div class="sidebar-foot">
        <button type="button" class={`find-btn${running ? ' running' : ''}`} onClick={() => (running ? call('discovery:cancel') : call('discovery:run'))} title={running ? 'Stop' : 'Check your sources for new opportunities'}>
          <RefreshCw size={14} class={running ? 'spin' : ''} />
          <span>{running ? `Checking sources ${doneN}/${srcs.length}…` : 'Find new opportunities'}</span>
        </button>
        <div class="sidebar-meta">{running ? 'Click to stop' : `Last checked ${ago(meta.value.lastDiscoveryAt)}`}</div>
        <UpdateNotice />
      </div>
    </nav>
  );
}

function UpdateNotice() {
  const u = updates.value;
  if (u.state === 'available') {
    return (
      <button type="button" class="update-notice" onClick={() => go('settings', { section: 'updates' })}>
        <Download size={13} /> Atelier {u.latest?.version} is available
      </button>
    );
  }
  if (u.state === 'ready') {
    return <button type="button" class="update-notice" onClick={() => call('updates:install')}><Download size={13} /> Restart to update</button>;
  }
  if (u.state === 'downloading') return <div class="update-notice muted">Downloading update… {Math.round((u.progress || 0) * 100)}%</div>;
  return null;
}

function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div class={`toast toast-${t.kind}`} key={t.id}>
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => { toasts.value = toasts.value.filter((x) => x.id !== t.id); }}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

function View() {
  const r = route.value;
  switch (r.view) {
    case 'discover': return <Discover />;
    case 'opportunities': return <Opportunities />;
    case 'opportunity': return <OpportunityDetail id={r.id} tab={r.tab} />;
    case 'applications': return <Applications />;
    case 'application': return <ApplicationDetail id={r.id} tab={r.tab} />;
    case 'calendar': return <CalendarView />;
    case 'map': return <MapView />;
    case 'portfolio': return <Portfolio />;
    case 'writing': return <Writing />;
    case 'profile': return <Profile />;
    case 'sources': return <Sources />;
    case 'settings': return <Settings section={r.section} />;
    default: return <Discover />;
  }
}

function App() {
  useEffect(() => {
    const off = window.atelier.on('menu:command', (cmd, arg, arg2) => {
      if (cmd === 'navigate') go(arg, arg2 ? { section: arg2 } : {});
      else if (cmd === 'back') back();
      else if (cmd === 'addUrl') openModal('addUrl');
      else if (cmd === 'addManual') openModal('addManual');
      else if (cmd === 'search') openModal('search');
      else if (cmd === 'newProposal') openModal('guidedProposal');
    });
    return off;
  }, []);
  if (!ready.value) return <div class="loading">Opening Atelier…</div>;
  return (
    <div class={`app platform-${meta.value.platform}`}>
      <div class="titlebar-drag" />
      <Sidebar />
      <main class="main">
        <div class="main-scroll"><View /></div>
      </main>
      <ModalHost />
      <Toasts />
    </div>
  );
}

// Used by the end-to-end walkthrough to navigate directly.
window.__go = go;

init().then(() => {}, (err) => {
  document.body.innerHTML = `<pre style="padding:24px">Atelier couldn’t start: ${String(err?.message || err)}</pre>`;
});
render(<App />, document.getElementById('root'));

// Close modal on route change.
route.subscribe(() => { if (modal.value?.props?.keepOnRoute !== true) closeModal(); });
export { setRouteParams };
