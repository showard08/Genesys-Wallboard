/* Default settings, shared by the content script (cards.js) and the popup
   (popup.js). Anything saved from the popup overrides these.
   Assigned on globalThis (not `const`) so the file can be safely injected
   into a page more than once. */

globalThis.AGENT_CARDS_DEFAULTS = globalThis.AGENT_CARDS_DEFAULTS || {
  style: 'large',        // 'large' (2-up boxes) | 'compact' (thin rows)
  columns: 2,            // large style: cards per row
  fontScale: 1,          // 1 = normal; 1.25 = 25% bigger, etc.
  autoScroll: true,      // scroll down/up when the list overflows
  scrollSpeed: 35,       // px per second
  edgePause: 2.5,        // seconds to hold at top/bottom
  callGlow: true,        // blue glow on Interacting cards
  glowPulse: true,       // ...and make it breathe
  callTimerReplaces: true, // Interacting: show call timer instead of main timer
  wallboard: false,        // promote the Agent Status widget to a full-width band on top
  wallboardHeight: 50,     // wallboard mode: agent band height, in vh (% of screen)
};
