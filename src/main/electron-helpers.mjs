// Things only Electron can do: load pages with JavaScript, fetch with the shared sign-in session,
// make thumbnails, and print HTML to PDF.
import { BrowserWindow, session, nativeImage, net } from 'electron';
import config from '../config.mjs';
import { FetchError } from './net/fetcher.mjs';

const PARTITION = 'persist:sources';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sourcesSession() {
  return session.fromPartition(PARTITION);
}

/** fetch() through the same session as the Atelier browser, so sign-ins there apply here. */
export function sessionFetch(url, init = {}) {
  const ses = sourcesSession();
  if (typeof ses.fetch === 'function') return ses.fetch(url, init);
  return net.fetch(url, init);
}

/** Load a page in a hidden window so its JavaScript runs, then return the resulting HTML. */
export async function renderPage(url, { signal, timeoutMs = 30000 } = {}) {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 1000,
    webPreferences: { partition: PARTITION, images: false, sandbox: true, contextIsolation: true, backgroundThrottling: false, spellcheck: false },
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  let status = 200;
  win.webContents.on('did-navigate', (_e, _u, code) => { if (code) status = code; });
  const onAbort = () => { try { win.destroy(); } catch {} };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new FetchError('timeout')), timeoutMs);
      win.webContents.once('did-finish-load', () => { clearTimeout(t); resolve(); });
      win.webContents.on('did-fail-load', (_e, code, desc, _url, isMain) => {
        if (isMain && code !== -3) { clearTimeout(t); reject(new FetchError(/NAME_NOT_RESOLVED/.test(desc) ? 'not-found' : /INTERNET_DISCONNECTED/.test(desc) ? 'offline' : 'unknown', `Couldn’t load the page (${desc}).`)); }
      });
      win.loadURL(url, { userAgent: config.fetching.userAgent }).catch(() => {});
    });
    if (status === 404 || status === 410) throw new FetchError('not-found', undefined, status);
    if (status === 401) throw new FetchError('needs-login', undefined, status);
    if (status === 403 || status === 429) throw new FetchError(status === 429 ? 'rate-limited' : 'blocked', undefined, status);
    // Wait for client-side rendering to settle.
    let last = -1;
    for (let i = 0; i < 18; i += 1) {
      await sleep(i < 2 ? 400 : 650);
      const n = await win.webContents.executeJavaScript('document.body ? document.body.innerText.length : 0', true);
      if (n > 300 && Math.abs(n - last) < 40) break;
      last = n;
    }
    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
    return { html, url: win.webContents.getURL() || url };
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    if (!win.isDestroyed()) win.destroy();
  }
}

export async function makeThumb(file, kind) {
  try {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      const img = await nativeImage.createThumbnailFromPath(file, { width: 480, height: 480 });
      if (!img.isEmpty()) return img.toPNG();
    }
    if (kind === 'image') {
      const img = nativeImage.createFromPath(file);
      if (img.isEmpty()) return null;
      const { width } = img.getSize();
      return (width > 480 ? img.resize({ width: 480, quality: 'good' }) : img).toPNG();
    }
  } catch { /* no thumbnail */ }
  return null;
}

export async function htmlToPdf(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await win.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { marginType: 'default' } });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
