/* Settings popup: loads from chrome.storage.sync, saves on every change.
   The content script (cards.js) listens for storage changes and applies
   them to the wallboard immediately. Also manages which sites the
   extension is enabled on (see sites.js). */

const $ = (id) => document.getElementById(id);

// ── Sites ────────────────────────────────────────────────────────────────

// Looked up when the popup opens so the click handler can call
// permissions.request() straight away (it must run inside a user gesture).
let currentTab = null;
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  currentTab = tab || null;
});

function siteMsg(text, isError = false) {
  $('siteMsg').textContent = text;
  $('siteMsg').classList.toggle('error', isError);
}

async function renderSites() {
  const list = $('sites');
  list.textContent = '';
  const sites = await getSites();

  if (!sites.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Not enabled anywhere yet. Open your Genesys analytics dashboard tab, then click the button.';
    list.appendChild(li);
    return;
  }

  for (const host of sites) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'host';
    name.textContent = host;
    name.title = host;
    li.appendChild(name);

    if (!(await hasSitePermission(host))) {
      // e.g. permission declined, or revoked from the browser's extension page
      const warn = document.createElement('span');
      warn.className = 'warn';
      warn.textContent = 'no access';
      li.appendChild(warn);
      const enable = document.createElement('button');
      enable.className = 'small';
      enable.textContent = 'Enable';
      enable.addEventListener('click', () => enableSite(host));
      li.appendChild(enable);
    }

    const remove = document.createElement('button');
    remove.className = 'small';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeSite(host));
    li.appendChild(remove);
    list.appendChild(li);
  }
}

async function enableSite(host, tab = null) {
  // The native permission prompt steals focus and CLOSES this popup, which
  // kills this script mid-flow. Record the intent first: if we die at the
  // prompt, the background worker sees permissions.onAdded fire and
  // completes the enable — one click, no second visit needed.
  await chrome.storage.local.set({ pendingEnable: { host, tabId: tab?.id ?? null, at: Date.now() } });
  const granted = await chrome.permissions.request({ origins: sitePatterns(host) });
  if (!granted) {
    await chrome.storage.local.remove('pendingEnable');
    siteMsg('Permission was declined — nothing changed.', true);
    return;
  }
  // Popup survived (e.g. permission was already granted): finish here.
  await chrome.storage.local.remove('pendingEnable');
  try {
    await finalizeEnable(host, tab?.id ?? null);
  } catch (e) {
    siteMsg(`Couldn't enable on ${host}: ${e.message}`, true);
    return;
  }
  siteMsg(`Enabled on ${host}.`);
  renderSites();
}

async function removeSite(host) {
  await unregisterSite(host);
  await setSites((await getSites()).filter((h) => h !== host));
  try {
    await chrome.permissions.remove({ origins: sitePatterns(host) });
  } catch (e) {
    // Fine — the registration is gone regardless
  }
  siteMsg(`Removed ${host}. Reload that tab to clear the styling.`);
  renderSites();
}

$('addSite').addEventListener('click', () => {
  let host;
  try {
    const url = new URL(currentTab?.url || '');
    if (url.protocol !== 'https:') throw new Error('not https');
    host = url.hostname;
  } catch (e) {
    siteMsg('Switch to your Genesys analytics dashboard tab (an https:// page) and try again.', true);
    return;
  }
  // Soft steer: the wallboard lives under /directory/ (the analytics
  // dashboards). Enabling works from anywhere on the host, but scripts only
  // run on /directory/* pages, so tell the user if they're elsewhere.
  try {
    const path = new URL(currentTab.url).pathname;
    if (!path.startsWith('/directory')) {
      siteMsg(`Enabled for ${host}, but note the wallboard only runs on that site's /directory/ dashboard pages.`);
    }
  } catch (e) { /* message already handled */ }
  enableSite(host, currentTab);
});

renderSites();

// ── Settings ─────────────────────────────────────────────────────────────
// The look (style / columns / text size) is a per-mode profile: the popup's
// three controls always show and edit the ACTIVE mode's profile. Toggling
// wallboard swaps the controls to the other profile's saved values.

let current = { ...AGENT_CARDS_DEFAULTS };
let lastWallboard = null;

function profileKeys() {
  return $('wallboard').checked
    ? { style: 'wallboardStyle', columns: 'wallboardColumns', fontScale: 'wallboardFontScale' }
    : { style: 'style', columns: 'columns', fontScale: 'fontScale' };
}

function renderProfile() {
  const k = profileKeys();
  document.querySelector(`input[name="style"][value="${current[k.style]}"]`).checked = true;
  $('columns').value = String(current[k.columns]);
  $('fontScale').value = String(current[k.fontScale]);
}

function render(s) {
  current = { ...AGENT_CARDS_DEFAULTS, ...s };
  $('wallboard').checked = current.wallboard;
  lastWallboard = current.wallboard;
  renderProfile();
  $('autoScroll').checked = current.autoScroll;
  $('scrollSpeed').value = String(current.scrollSpeed);
  $('edgePause').value = String(current.edgePause);
  $('callGlow').checked = current.callGlow;
  $('glowPulse').checked = current.glowPulse;
  $('callTimerReplaces').checked = current.callTimerReplaces;
  $('wallboardHeight').value = String(current.wallboardHeight);
  refresh();
}

function read() {
  const num = (id, fallback) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  };
  const k = profileKeys();
  current[k.style] = document.querySelector('input[name="style"]:checked').value;
  current[k.columns] = parseInt($('columns').value, 10);
  current[k.fontScale] = num('fontScale', AGENT_CARDS_DEFAULTS[k.fontScale]);
  current.autoScroll = $('autoScroll').checked;
  current.scrollSpeed = num('scrollSpeed', AGENT_CARDS_DEFAULTS.scrollSpeed);
  current.edgePause = num('edgePause', AGENT_CARDS_DEFAULTS.edgePause);
  current.callGlow = $('callGlow').checked;
  current.glowPulse = $('glowPulse').checked;
  current.callTimerReplaces = $('callTimerReplaces').checked;
  current.wallboard = $('wallboard').checked;
  current.wallboardHeight = parseInt($('wallboardHeight').value, 10);
  return { ...current };
}

// Derived UI state: value labels, dependent rows greyed out
function refresh() {
  $('fontScaleValue').textContent = Math.round(parseFloat($('fontScale').value) * 100) + '%';
  $('wallboardHeightValue').textContent = $('wallboardHeight').value + '%';
  const compact = document.querySelector('input[name="style"]:checked').value === 'compact';
  // Cards per row applies to compact too in wallboard mode
  $('columnsRow').classList.toggle('disabled', compact && !$('wallboard').checked);
  for (const row of document.querySelectorAll('[data-depends]')) {
    row.classList.toggle('disabled', !$(row.dataset.depends).checked);
  }
}

let savedTimer;
function save() {
  // Wallboard toggled? Swap the three profile controls to the other mode's
  // saved values BEFORE reading, so this mode's edits don't leak into the
  // other mode's profile.
  if ($('wallboard').checked !== lastWallboard) {
    lastWallboard = $('wallboard').checked;
    current.wallboard = lastWallboard;
    renderProfile();
  }
  refresh();
  chrome.storage.sync.set(read(), () => {
    $('saved').classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => $('saved').classList.remove('show'), 1200);
  });
}

chrome.storage.sync.get(AGENT_CARDS_DEFAULTS, (stored) => {
  render({ ...AGENT_CARDS_DEFAULTS, ...stored });
});

for (const el of document.querySelectorAll('section input, section select')) {
  el.addEventListener('input', save);
  el.addEventListener('change', save);
}

$('reset').addEventListener('click', () => {
  chrome.storage.sync.set(AGENT_CARDS_DEFAULTS, () => render({ ...AGENT_CARDS_DEFAULTS }));
});
