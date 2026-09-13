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
    root.classList.toggle('agent-cards-large', settings.style === 'large');
    root.classList.toggle('agent-cards-compact', settings.style === 'compact');
    root.classList.toggle('agent-cards-no-glow', !settings.callGlow);
    root.classList.toggle('agent-cards-no-pulse', !settings.glowPulse);
    root.classList.toggle('agent-cards-keep-timer', !settings.callTimerReplaces);
    root.classList.toggle('agent-cards-wallboard', !!settings.wallboard);
    root.style.setProperty('--agent-cards-wallboard-h', settings.wallboardHeight + 'vh');
    root.style.setProperty('--agent-cards-cols', String(settings.columns));
    root.style.setProperty('--agent-cards-scale', String(settings.fontScale));
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
