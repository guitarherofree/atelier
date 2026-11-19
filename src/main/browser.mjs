// The Atelier browser: a normal browsing window with a toolbar to capture the page you're on as an
// opportunity. It shares its sign-ins with Atelier's source fetching, so signing in here once lets
// Atelier read members-only listings. Used for Instagram browsing and sites that block automated access.
import { BaseWindow, WebContentsView, shell } from 'electron';
import config from '../config.mjs';

const BAR = 52;

export class AtelierBrowser {
  constructor({ preload, toolbarUrl, partition = 'persist:sources', onCapture }) {
    this.preload = preload;
    this.toolbarUrl = toolbarUrl;
    this.partition = partition;
    this.onCapture = onCapture;
    this.win = null;
    this.bar = null;
    this.page = null;
  }

  isOpen() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  #layout() {
    if (!this.isOpen()) return;
    const { width, height } = this.win.getContentBounds();
    this.bar.setBounds({ x: 0, y: 0, width, height: BAR });
    this.page.setBounds({ x: 0, y: BAR, width, height: Math.max(0, height - BAR) });
  }

  #sendState(extra = {}) {
    if (!this.isOpen() || this.bar.webContents.isDestroyed()) return;
    const wc = this.page.webContents;
    this.bar.webContents.send('browser:state', {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(),
      canGoForward: wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward(),
      purpose: this.purpose,
      ...extra,
    });
  }

  open(url, { purpose = '' } = {}) {
    this.purpose = purpose;
    if (!this.isOpen()) {
      this.win = new BaseWindow({ width: 1180, height: 860, minWidth: 720, minHeight: 480, title: 'Atelier Browser', backgroundColor: '#f4f1ea' });
      this.bar = new WebContentsView({ webPreferences: { preload: this.preload, contextIsolation: true, sandbox: true } });
      this.page = new WebContentsView({ webPreferences: { partition: this.partition, contextIsolation: true, sandbox: true } });
      this.win.contentView.addChildView(this.page);
      this.win.contentView.addChildView(this.bar);
      this.bar.webContents.loadURL(this.toolbarUrl);
      this.page.webContents.setUserAgent(config.fetching.userAgent);
      const wc = this.page.webContents;
      for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) wc.on(ev, () => this.#sendState());
      wc.setWindowOpenHandler(({ url: u }) => {
        if (/^https?:/.test(u)) wc.loadURL(u);
        return { action: 'deny' };
      });
      this.bar.webContents.on('did-finish-load', () => this.#sendState());
      this.win.on('resize', () => this.#layout());
      this.win.on('closed', () => { this.win = null; this.bar = null; this.page = null; });
      this.#layout();
    }
    if (url) this.page.webContents.loadURL(url);
    this.win.show();
    this.win.focus();
    this.#sendState();
  }

  command(cmd, arg) {
    if (!this.isOpen()) return;
    const wc = this.page.webContents;
    const nav = wc.navigationHistory;
    if (cmd === 'back') nav?.goBack ? nav.goBack() : wc.goBack();
    else if (cmd === 'forward') nav?.goForward ? nav.goForward() : wc.goForward();
    else if (cmd === 'reload') wc.reload();
    else if (cmd === 'go' && arg) {
      let u = String(arg).trim();
      if (!/^https?:\/\//i.test(u)) u = /\s/.test(u) || !/\./.test(u) ? `https://duckduckgo.com/?q=${encodeURIComponent(u)}` : `https://${u}`;
      wc.loadURL(u);
    } else if (cmd === 'external') {
      const u = wc.getURL();
      if (/^https?:/.test(u)) shell.openExternal(u);
    }
  }

  async capture({ save = false } = {}) {
    if (!this.isOpen()) return { error: 'The browser is closed.' };
    const wc = this.page.webContents;
    const url = wc.getURL();
    if (!/^https?:/.test(url)) return { error: 'Open a web page first.' };
    this.#sendState({ capturing: true });
    try {
      const html = await wc.executeJavaScript('document.documentElement.outerHTML', true);
      const result = await this.onCapture({ url, html, status: save ? 'saved' : 'new' });
      this.#sendState({ captured: { name: result.name, updated: result.updated, fields: result.fieldsFound } });
      return result;
    } catch (err) {
      this.#sendState({ captureError: err.message });
      return { error: err.message };
    }
  }

  close() {
    if (this.isOpen()) this.win.close();
  }
}
