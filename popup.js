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

function render(s) {
  document.querySelector(`input[name="style"][value="${s.style}"]`).checked = true;
  $('columns').value = String(s.columns);
  $('fontScale').value = String(s.fontScale);
  $('autoScroll').checked = s.autoScroll;
  $('scrollSpeed').value = String(s.scrollSpeed);
  $('edgePause').value = String(s.edgePause);
  $('callGlow').checked = s.callGlow;
  $('glowPulse').checked = s.glowPulse;
  $('callTimerReplaces').checked = s.callTimerReplaces;
  $('wallboard').checked = s.wallboard;
  $('wallboardHeight').value = String(s.wallboardHeight);
  refresh();
}

function read() {
  const num = (id, fallback) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    style: document.querySelector('input[name="style"]:checked').value,
    columns: parseInt($('columns').value, 10),
    fontScale: num('fontScale', AGENT_CARDS_DEFAULTS.fontScale),
    autoScroll: $('autoScroll').checked,
    scrollSpeed: num('scrollSpeed', AGENT_CARDS_DEFAULTS.scrollSpeed),
    edgePause: num('edgePause', AGENT_CARDS_DEFAULTS.edgePause),
    callGlow: $('callGlow').checked,
    glowPulse: $('glowPulse').checked,
    callTimerReplaces: $('callTimerReplaces').checked,
    wallboard: $('wallboard').checked,
    wallboardHeight: parseInt($('wallboardHeight').value, 10),
  };
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
