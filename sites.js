/* Site registration, shared by popup.js and background.js.
   Wallboard-only edition: the user enables the extension on their own
   Genesys domain from the popup — no allow-list, no enterprise policy.
   The content script is scoped to that host's /directory/ area: the
   analytics dashboards live at https://<host>/directory/#/analytics/… and
   the #fragment can't be matched by the browser, so /directory/* is the
   tightest possible scope. The cards CSS only ever activates on the Agent
   Status widget, so other /directory pages are untouched. */

const SITES_KEY = 'sites';
const CONTENT_CSS = ['cards.css'];
const CONTENT_JS = ['defaults.js', 'cards.js'];

function sitePatterns(host) {
  return [`https://${host}/directory/*`];
}

function siteScriptId(host) {
  return `agent-wallboard:${host}`;
}

async function getSites() {
  const stored = await chrome.storage.local.get(SITES_KEY);
  return stored[SITES_KEY] || [];
}

async function setSites(sites) {
  await chrome.storage.local.set({ [SITES_KEY]: sites });
}

async function isRegistered(host) {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [siteScriptId(host)] });
  return scripts.length > 0;
}

async function registerSite(host) {
  const id = siteScriptId(host);
  if (await isRegistered(host)) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }
  await chrome.scripting.registerContentScripts([{
    id,
    matches: sitePatterns(host),
    allFrames: true,
    /* matchOriginAsFallback is NOT set: Chrome only allows it with a "/*"
       path, and our patterns are scoped to /directory/*. It's only needed
       for about:blank/data: frames, which the dashboard doesn't use. */
    css: CONTENT_CSS,
    js: CONTENT_JS,
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
}

async function unregisterSite(host) {
  if (await isRegistered(host)) {
    await chrome.scripting.unregisterContentScripts({ ids: [siteScriptId(host)] });
  }
}

async function hasSitePermission(host) {
  return chrome.permissions.contains({ origins: sitePatterns(host) });
}

/* Complete an enable: register the content scripts, remember the host, and
   inject into the already-open tab so it works without a reload. Idempotent
   on purpose — the popup AND the background worker may both call this for
   the same enable (see pendingEnable below) and doubling up is harmless:
   registerSite replaces, the sites list is de-duped, and cards.js guards
   against loading twice. */
async function finalizeEnable(host, tabId) {
  await registerSite(host);
  const sites = await getSites();
  if (!sites.includes(host)) await setSites([...sites, host]);
  if (tabId != null) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: CONTENT_CSS });
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_JS });
    } catch (e) { /* not fatal — it'll load on the next page load */ }
  }
}

/* Re-register every enabled site we still hold permission for. Dynamic
   registrations don't survive an extension update/reload; permissions do. */
async function syncRegistrations() {
  for (const host of await getSites()) {
    if (await hasSitePermission(host)) {
      await registerSite(host);
    }
  }
}
