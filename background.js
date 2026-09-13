/* Service worker: keeps the dynamically registered content scripts in place
   across extension updates/reloads and browser restarts. Wallboard-only
   edition — no dialling, no enterprise policy. */

importScripts('sites.js');

chrome.runtime.onInstalled.addListener(() => { syncRegistrations(); });
chrome.runtime.onStartup.addListener(() => { syncRegistrations(); });

/* One-click enable: the native permission prompt steals focus from the
   popup, which closes it and kills its scripts mid-flow — so the popup
   records a pendingEnable first, and when the user clicks Allow this
   listener fires (popup dead or alive) and completes the registration. */
chrome.permissions.onAdded.addListener(async (perms) => {
  const { pendingEnable } = await chrome.storage.local.get('pendingEnable');
  if (!pendingEnable) return;
  if (Date.now() - (pendingEnable.at || 0) > 2 * 60 * 1000) {
    await chrome.storage.local.remove('pendingEnable');
    return; // stale — some old attempt
  }
  const origins = perms.origins || [];
  if (!origins.some((o) => o.includes(`://${pendingEnable.host}/`))) return;
  await chrome.storage.local.remove('pendingEnable');
  await finalizeEnable(pendingEnable.host, pendingEnable.tabId);
});
