/* Settings + auto-scroll for the Agent Status cards.
   Reads settings from chrome.storage.sync (set via the popup) and applies
   them as classes / CSS variables on <html>, live — no reload needed.
   When the card list overflows its widget, slowly scroll to the bottom,
   pause, scroll back to the top, pause, repeat. The Ember DOM is never
   touched — we only drive scrollTop on the widget's existing scroll
   container, so live re-renders and per-second timers keep working. */

(() => {
  // The popup injects this into an already-open tab when a site is enabled;
  // don't start a second scroll loop if it's already running here.
  if (globalThis.__agentCardsLoaded) return;
  globalThis.__agentCardsLoaded = true;

  let settings = { ...AGENT_CARDS_DEFAULTS };

  function apply() {
    const root = document.documentElement;
    // The look comes from the active mode's profile (see defaults.js)
    const wb = !!settings.wallboard;
    const style = wb ? settings.wallboardStyle : settings.style;
    const columns = wb ? settings.wallboardColumns : settings.columns;
    const fontScale = wb ? settings.wallboardFontScale : settings.fontScale;
    root.classList.toggle('agent-cards-large', style === 'large');
    root.classList.toggle('agent-cards-compact', style === 'compact');
    root.classList.toggle('agent-cards-no-glow', !settings.callGlow);
    root.classList.toggle('agent-cards-no-pulse', !settings.glowPulse);
    root.classList.toggle('agent-cards-keep-timer', !settings.callTimerReplaces);
    root.classList.toggle('agent-cards-wallboard', wb);
    root.style.setProperty('--agent-cards-wallboard-h', settings.wallboardHeight + 'vh');
    root.style.setProperty('--agent-cards-cols', String(columns));
    root.style.setProperty('--agent-cards-scale', String(fontScale));
    applyTheme();
  }

  // ── Theme ──────────────────────────────────────────────────────────────
  // Genesys has its own dark-mode toggle on the dashboard: it repaints the
  // page #131315 and turns the text white, but the cards' white background
  // is ours — so without this the names and timers vanish (white on white).
  // 'auto' (default) follows Genesys: look for an explicit theme hook on
  // <html>/<body>, else sample the colour actually painted behind the
  // widget. Sampling rather than relying on a class name means it keeps
  // working when Genesys renames things. Result → html.agent-cards-dark,
  // which cards.css keys the dark palette off.
  function luminance(color) {
    const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(color || '');
    if (!m) return null;
    const alpha = m[4] == null ? 1 : parseFloat(m[4]) / (m[4].endsWith('%') ? 100 : 1);
    if (alpha < 0.5) return null; // (near-)transparent: whatever's behind shows through
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  }

  function genesysIsDark() {
    const root = document.documentElement;
    const body = document.body;
    for (const el of [root, body]) {
      if (!el) continue;
      for (const c of el.classList) {
        if (/^(dark|dark-theme|theme-dark|dark-mode|gux-dark-theme)$/i.test(c)) return true;
      }
      for (const attr of ['data-theme', 'gux-theme', 'data-gux-theme', 'theme', 'data-color-scheme']) {
        if (/dark/i.test(el.getAttribute(attr) || '')) return true;
      }
    }
    if (getComputedStyle(root).colorScheme === 'dark') return true;

    // Walk up from the cards' table to the first opaque background: that is
    // the surface the cards sit on. (gux-table itself is made transparent
    // by cards.css, so start from its parent.)
    const table = document.querySelector('.widget-type-AGENT_STATUS gux-table');
    for (let el = table ? table.parentElement : body; el; el = el.parentElement) {
      const L = luminance(getComputedStyle(el).backgroundColor);
      if (L != null) return L < 0.5;
    }
    // Nothing opaque anywhere — go by the text colour Genesys gives the
    // widget (NOT the cards, whose colour cards.css sets in dark mode).
    const widget = document.querySelector('.widget-type-AGENT_STATUS');
    const L = widget ? luminance(getComputedStyle(widget).color) : null;
    return L != null && L > 0.6;
  }

  function applyTheme() {
    const root = document.documentElement;
    let dark;
    if (settings.theme === 'dark') dark = true;
    else if (settings.theme === 'light') dark = false;
    else {
      try { dark = genesysIsDark(); } catch (e) { dark = false; }
    }
    root.classList.toggle('agent-cards-dark', dark);
  }

  // Genesys' toggle flips a class/attribute/style on the document; the 2s
  // discover() poll below is the safety net for anything it doesn't.
  if (typeof MutationObserver !== 'undefined') {
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true });
    const watchBody = () => document.body && themeObserver.observe(document.body, { attributes: true });
    if (document.body) watchBody(); else document.addEventListener('DOMContentLoaded', watchBody, { once: true });
  }

  apply();
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get(AGENT_CARDS_DEFAULTS, (stored) => {
      settings = { ...AGENT_CARDS_DEFAULTS, ...stored };
      apply();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        settings[key] = newValue ?? AGENT_CARDS_DEFAULTS[key];
      }
      apply();
    });
  }

  // ── Auto-scroll ────────────────────────────────────────────────────────
  // Each widget's nearest scrollable ancestor is what we drive. Re-discover
  // every couple of seconds in case Ember rebuilds the widget.
  let containers = [];
  function discover() {
    const found = new Set();
    for (const table of document.querySelectorAll(
      '.widget-type-AGENT_STATUS gux-table'
    )) {
      // Genesys's Spark component scrolls the table INSIDE gux-table's
      // shadow root (.gux-table-container, aria-label "Scrollable region").
      // Shadow interiors are neither ancestors nor visible to normal
      // queries, so check there first.
      const inner = table.shadowRoot?.querySelector('.gux-table-container');
      if (inner && inner.scrollHeight - inner.clientHeight > 4) {
        found.add(inner);
        continue;
      }
      // Fallback: a scrollable light-DOM ancestor (the pre-wallboard layout)
      for (let el = table.parentElement; el; el = el.parentElement) {
        if (el.scrollHeight - el.clientHeight > 4) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll') {
            found.add(el);
            break;
          }
        }
      }
    }
    containers = [...found];
    applyTheme();
  }
  discover();
  setInterval(discover, 2000);

  // Per-container scroll state (float position — scrollTop alone would lose
  // the sub-pixel movement between frames)
  const state = new WeakMap();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (settings.autoScroll) {
      const pauseMs = settings.edgePause * 1000;
      for (const el of containers) {
        if (!el.isConnected) continue;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) continue;

        let s = state.get(el);
        if (!s) {
          s = { pos: el.scrollTop, dir: 1, pauseUntil: now + pauseMs };
          state.set(el, s);
        }
        if (now < s.pauseUntil) continue;

        s.pos = Math.min(
          Math.max(s.pos + s.dir * settings.scrollSpeed * dt, 0),
          max
        );
        el.scrollTop = s.pos;

        if (s.dir > 0 && s.pos >= max) {
          s.dir = -1;
          s.pauseUntil = now + pauseMs;
        } else if (s.dir < 0 && s.pos <= 0) {
          s.dir = 1;
          s.pauseUntil = now + pauseMs;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
