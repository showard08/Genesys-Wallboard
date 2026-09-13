/* Default settings, shared by the content script (cards.js) and the popup
   (popup.js). Anything saved from the popup overrides these.
   Assigned on globalThis (not `const`) so the file can be safely injected
   into a page more than once. */

globalThis.AGENT_CARDS_DEFAULTS = globalThis.AGENT_CARDS_DEFAULTS || {
  /* The look (style / columns / text size) is a PER-MODE profile: one set
     for normal sidebar mode, one for wallboard mode. The popup shows and
     edits whichever profile is active, so each mode remembers its own
     tuning and toggling wallboard swaps the whole look. */
  style: 'compact',      // normal mode: 'large' (boxes) | 'compact' (thin rows)
  columns: 1,            // normal mode: cards per row
  fontScale: 1,          // normal mode: 1 = 100% text
  wallboardStyle: 'large',   // wallboard mode: big boxes…
  wallboardColumns: 8,       // …8 across…
  wallboardFontScale: 1.5,   // …150% text, for reading across a room
  autoScroll: true,      // scroll down/up when the list overflows
  scrollSpeed: 35,       // px per second
  edgePause: 2.5,        // seconds to hold at top/bottom
  callGlow: true,        // blue glow on Interacting cards
  glowPulse: true,       // ...and make it breathe
  callTimerReplaces: true, // Interacting: show call timer instead of main timer
  wallboard: false,        // promote the Agent Status widget to a full-width band on top
  wallboardHeight: 55,     // wallboard mode: agent band height, in vh (% of screen)
};
