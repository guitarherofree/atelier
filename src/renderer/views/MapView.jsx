// Where residencies are. Online opportunities are listed separately (they have no place on a map).
import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import { Globe, MapPin, Crosshair, LocateFixed } from 'lucide-preact';
import { data, go, call, meta, appByOpp, toast } from '../lib/store.js';
import { oppName, fieldText, APP_STATUS_BY_KEY } from '../../shared/schema.mjs';
import { Button, DeadlineBadge, Select } from '../components/Common.jsx';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function category(o, apps) {
  if (apps.get(o.id)) return 'applying';
  return o.status === 'saved' ? 'saved' : 'new';
}

export function MapView() {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [show, setShow] = useState('saved+applying');
  const [placing, setPlacing] = useState(null);
  const [busy, setBusy] = useState(false);
  const apps = appByOpp.value;
  const all = data.value.opportunities.filter((o) => o.status !== 'dismissed');
  const visible = all.filter((o) => {
    const c = category(o, apps);
    if (show === 'all') return true;
    if (show === 'new') return c === 'new';
    return c !== 'new';
  });
  const online = visible.filter((o) => o.fields?.mode?.value === 'Online');
  const hybrid = visible.filter((o) => o.fields?.mode?.value === 'Hybrid');
  const placed = visible.filter((o) => o.geo?.lat != null && o.fields?.mode?.value !== 'Online');
  const unplaced = visible.filter((o) => o.fields?.mode?.value !== 'Online' && o.geo?.lat == null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([30, -20], 2);
    L.tileLayer(meta.value.map?.tiles || 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: meta.value.map?.attribution || '© OpenStreetMap contributors © CARTO', subdomains: 'abcd', maxZoom: 18,
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    el.current.addEventListener('click', (e) => {
      const a = e.target.closest('[data-open]');
      if (a) { e.preventDefault(); go('opportunity', { id: a.getAttribute('data-open') }); }
    });
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const onClick = async (e) => {
      if (!placing) return;
      await call('opp:update', placing, { geo: { lat: e.latlng.lat, lon: e.latlng.lng, source: 'manual', label: 'Placed by you' } });
      setPlacing(null);
      toast('Position saved', 'success');
    };
    m.on('click', onClick);
    el.current.classList.toggle('placing', Boolean(placing));
    return () => m.off('click', onClick);
  }, [placing]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    const pts = [];
    for (const o of placed) {
      const c = category(o, apps);
      const hyb = o.fields?.mode?.value === 'Hybrid';
      const icon = L.divIcon({ className: '', html: `<span class="pin pin-${c}${hyb ? ' pin-hybrid' : ''}"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
      const app = apps.get(o.id);
      const dl = o.fields?.deadline?.value;
      L.marker([o.geo.lat, o.geo.lon], { icon, title: oppName(o) }).addTo(g).bindPopup(
        `<div class="pop"><b>${esc(oppName(o))}</b><div>${esc(fieldText('location', o.fields?.location))}${hyb ? ' · hybrid' : ''}</div>`
        + `<div>${dl ? `Deadline: ${esc(dl === 'rolling' ? 'rolling' : dl)}` : ''}${app ? ` · ${esc(APP_STATUS_BY_KEY[app.status]?.label)}` : ''}</div>`
        + `${o.geo.source === 'manual' ? '<div class="muted">Placed by you</div>' : o.geo.label ? `<div class="muted">${esc(o.geo.label.slice(0, 90))}</div>` : ''}`
        + `<a href="#" data-open="${o.id}">Open</a></div>`,
      );
      pts.push([o.geo.lat, o.geo.lon]);
    }
    // Fit the view when new places appear (not when you've just panned around).
    if (pts.length && map.current && pts.length > (map.current._fittedCount || 0)) {
      map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 6 });
      map.current._fittedCount = pts.length;
    }
  }, [placed.map((o) => `${o.id}:${o.geo.lat}:${o.geo.lon}:${o.status}`).join('|'), apps]);

  const locateAll = async () => {
    setBusy(true);
    const r = await call('opp:geocodeMissing');
    setBusy(false);
    if (r && !r.error) toast(`Placed ${r.found} of ${r.tried} on the map`, 'success');
  };

  return (
    <div class="page page-wide map-page">
      <header class="page-head">
        <div><h1>Map</h1><p class="page-sub">In-person and hybrid residencies by location. Online opportunities are listed on the right.</p></div>
        <div class="page-actions">
          <Select value={show} onChange={setShow} options={[{ value: 'saved+applying', label: 'Saved and applying' }, { value: 'new', label: 'New in Discover' }, { value: 'all', label: 'Everything' }]} />
        </div>
      </header>
      <div class="map-layout">
        <div class="map-wrap">
          <div ref={el} class="map" />
          <div class="map-legend">
            <span><span class="pin pin-applying" /> Applying</span>
            <span><span class="pin pin-saved" /> Saved</span>
            <span><span class="pin pin-new" /> New</span>
            <span><span class="pin pin-saved pin-hybrid" /> Hybrid</span>
          </div>
          {placing && <div class="map-placing">Click the map to place “{oppName(data.value.opportunities.find((o) => o.id === placing))}”. <button type="button" class="link" onClick={() => setPlacing(null)}>Cancel</button></div>}
        </div>
        <aside class="map-side">
          <h4><Globe size={14} /> Online ({online.length})</h4>
          <ul class="map-list">
            {online.map((o) => <li><button type="button" class="link" onClick={() => go('opportunity', { id: o.id })}>{oppName(o)}</button> <DeadlineBadge opp={o} /></li>)}
            {!online.length && <li class="muted small">None</li>}
          </ul>
          {hybrid.length > 0 && <p class="muted small">{hybrid.length} hybrid opportunit{hybrid.length === 1 ? 'y is' : 'ies are'} on the map with a ring.</p>}
          <h4><MapPin size={14} /> Not on the map yet ({unplaced.length})</h4>
          {unplaced.length > 0 && data.value.settings.map?.geocode !== false && <Button small icon={LocateFixed} disabled={busy} onClick={locateAll}>{busy ? 'Looking up…' : 'Look up locations'}</Button>}
          <ul class="map-list">
            {unplaced.map((o) => (
              <li>
                <button type="button" class="link" onClick={() => go('opportunity', { id: o.id })}>{oppName(o)}</button>
                <div class="muted small">{fieldText('location', o.fields?.location) || 'No location recorded'}{o.geo?.notFound ? ' · not found' : ''}</div>
                <div class="inline-fields">
                  {fieldText('location', o.fields?.location) && data.value.settings.map?.geocode !== false && <Button small kind="ghost" onClick={async () => { const r = await call('opp:geocode', o.id); if (r?.notFound) toast('That location wasn’t found. Place it by hand.', 'error'); }}>Look up</Button>}
                  <Button small kind="ghost" icon={Crosshair} onClick={() => setPlacing(o.id)}>Place by hand</Button>
                </div>
              </li>
            ))}
          </ul>
          <p class="muted small">Location lookups send only the location text to OpenStreetMap. Turn them off in Settings › Map.</p>
        </aside>
      </div>
    </div>
  );
}
