// Bridge between the window and the main process. Only these calls are exposed.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set([
  'app:init', 'state:saveUi', 'ui:confirm', 'shell:open', 'shell:showData', 'log:show', 'profile:update',
  'profile:replace', 'settings:update', 'secrets:status', 'secrets:set', 'secrets:clear', 'col:create', 'col:update',
  'col:delete', 'col:reorder', 'opp:create', 'opp:importUrl', 'opp:setField', 'opp:verifyField', 'opp:verifyAll',
  'opp:acceptSite', 'opp:keepMine', 'opp:revert', 'opp:setStatus', 'opp:setStatusMany', 'opp:update', 'opp:delete',
  'opp:recheck', 'opp:history', 'opp:geocode', 'opp:geocodeMissing', 'opp:aiExtract', 'opp:aiFit', 'discovery:run',
  'discovery:cancel', 'sources:test', 'sources:restoreDefaults', 'sources:signIn', 'search:suggestions', 'search:run',
  'browser:open', 'instagram:browse', 'app:create', 'app:update', 'app:delete', 'app:attachFile', 'file:open',
  'file:reveal', 'app:review', 'app:confirm', 'app:unconfirm', 'app:exportPackage', 'app:openPortal',
  'app:markSubmitted', 'rec:sendRequest', 'writing:createTailored', 'ai:describe', 'ai:test', 'ai:log', 'ai:tailor',
  'ai:draftAnswer', 'ai:shorten', 'portfolio:addFiles', 'portfolio:addPaths', 'portfolio:removeFile',
  'portfolio:fileStatus', 'calendar:export', 'backup:now', 'backup:to', 'backup:list', 'backup:restore',
  'backup:export', 'backup:reveal', 'backup:chooseFolder', 'updates:status', 'updates:check', 'updates:download',
  'updates:install', 'updates:setToken', 'updates:clearToken', 'updates:hasToken', 'updates:skip',
]);
const EVENTS = new Set(['db:changed', 'discovery:progress', 'updates:status', 'menu:command', 'toast', 'browser:captured', 'ai:info']);

contextBridge.exposeInMainWorld('atelier', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, callback) {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event ${channel}`);
    const listener = (_e, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  pathForFile(file) {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },
});
