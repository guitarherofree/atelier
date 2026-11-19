// A small local web server that imitates opportunity sites, for tests.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

export function startFixtureServer(port = 0) {
  const state = { porteDeadline: '2027-02-01', porteFee: '€20', hits: {} };
  const pages = {
    '/resartis-open-calls/': () => read('site/listing-resartis.html'),
    '/open-call/porte-rouge-may-2027/': () => read('pages/resartis.html').replace('2027-02-01', state.porteDeadline).replace('application fee of €20', `application fee of ${state.porteFee}`),
    '/open-call/old-residency-2025/': () => '<html><body><main><h1>Old Residency 2025</h1><p>Application deadline: March 1, 2025. Located in Umbria, Italy. Open to all artists.</p></main></body></html>',
    '/open-call/remote-studio-fellowship/': () => read('pages/online.html'),
    '/calls': () => read('site/listing-auto.html'),
    '/opp/sound-field-residency-2027': () => read('pages/rivet.html'),
    '/opp/between-bridges-residency-2027': () => read('pages/artconnect.html'),
    '/opp/hillside-studios-spring-2027': () => read('pages/aca.html'),
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    state.hits[url.pathname] = (state.hits[url.pathname] || 0) + 1;
    if (url.pathname === '/open-call/blocked-call-2027/') {
      res.writeHead(403, { 'content-type': 'text/html' });
      return res.end('<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing. cf-browser-verification</body></html>');
    }
    if (url.pathname === '/gone') { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>Not found</h1>'); }
    if (url.pathname === '/feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml' });
      return res.end(read('site/feed.xml').replace(/HOST/g, req.headers.host));
    }
    if (url.pathname === '/geocode') {
      res.writeHead(200, { 'content-type': 'application/json' });
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const places = { lisbon: [38.72, -9.14], berlin: [52.52, 13.4], burgundy: [47.05, 4.38], 'north carolina': [35.6, -82.5] };
      const hit = Object.entries(places).find(([k]) => q.includes(k));
      return res.end(JSON.stringify(hit ? [{ lat: String(hit[1][0]), lon: String(hit[1][1]), display_name: q, addresstype: 'city' }] : []));
    }
    const page = pages[url.pathname];
    if (!page) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>Not found</h1>'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page());
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, base, state, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export function fixtureSources(base) {
  const common = { enabled: true, kind: 'listing', excludePattern: '', pagination: null, followNext: false, maxPages: 1, render: 'never', aggregator: true, defaultType: '', notes: '', lastRun: null };
  return [
    { ...common, name: 'Res Artis (test)', homepage: `${base}/resartis-open-calls/`, listingUrls: [`${base}/resartis-open-calls/`], linkPattern: '/open-call/[^/?#]+/?$' },
    { ...common, name: 'Auto-learned (test)', homepage: `${base}/calls`, listingUrls: [`${base}/calls`], linkPattern: '' },
    { ...common, name: 'Feed (test)', homepage: `${base}/feed.xml`, listingUrls: [`${base}/feed.xml`], kind: 'feed', linkPattern: '' },
  ];
}
