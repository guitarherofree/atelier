// Custom URL schemes so the window can show local files by id (never by raw path).
//   atelier-app://app/…            the interface itself (files under src/renderer)
//   atelier-file://file/<fileId>   a portfolio or material file (with Range support for video and audio)
//   atelier-thumb://thumb/<fileId> its thumbnail
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', map: 'application/json', svg: 'image/svg+xml',
  wasm: 'application/wasm', ttf: 'font/ttf', otf: 'font/otf', woff2: 'font/woff2', pfb: 'application/octet-stream',
  bcmap: 'application/octet-stream', icc: 'application/octet-stream',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', heic: 'image/heic',
  aif: 'audio/aiff', aiff: 'audio/aiff', ogg: 'audio/ogg', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
};

export function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'atelier-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
    { scheme: 'atelier-file', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: 'atelier-thumb', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

function notFound() {
  return new Response('Not found', { status: 404 });
}

export async function serveFile(file, request, { cache = false } = {}) {
  let st;
  try { st = await fsp.stat(file); } catch { return notFound(); }
  const type = MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache ? 'max-age=31536000, immutable' : 'no-cache',
  };
  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, st.size - parseInt(m[2], 10)); end = st.size - 1; }
    if (start >= st.size || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    }
    end = Math.min(end, st.size - 1);
    const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(fs.createReadStream(file));
  return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(st.size) } });
}

export function handleSchemes({ appRoot, portfolioFiles }) {
  protocol.handle('atelier-app', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(appRoot, rel);
    if (!file.startsWith(appRoot + path.sep)) return notFound();
    return serveFile(file, request);
  });
  protocol.handle('atelier-file', (request) => {
    const id = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const hit = portfolioFiles.find(id);
    return hit ? serveFile(portfolioFiles.pathOf(hit.file), request) : notFound();
  });
  protocol.handle('atelier-thumb', (request) => {
    const id = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const t = portfolioFiles.thumbPath(id);
    if (t) return serveFile(t, request, { cache: true });
    const hit = portfolioFiles.find(id);
    if (hit && hit.file.kind === 'image') return serveFile(portfolioFiles.pathOf(hit.file), request);
    return notFound();
  });
}
