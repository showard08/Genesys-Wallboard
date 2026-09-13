# Genesys Agent Wallboard

Browser extension (Edge/Chrome, Manifest V3) that turns the **Agent Status
widget** on a Genesys Cloud analytics dashboard
(`https://<your-genesys-host>/directory/#/analytics/dashboards/…`) into an
agent wallboard: colour-coded status cards, an optional full-width wallboard
mode with adjustable height and card density, and auto-scroll when the list
overflows. Built for wall-mounted screens.

This is the self-serve edition: you enable it on **your own Genesys domain**
from the popup — no configuration files, no enterprise policy. (A separate
policy-managed edition with click-to-dial exists for centrally administered
deployments: see genesys-wallboard-cards.)

## Install

1. Install from the Edge Add-ons store (or Load unpacked from this folder).
2. Open your Genesys Cloud analytics dashboard tab.
3. Click the extension's toolbar icon → **Add current tab's site** → accept
   the permission prompt.

The extension only runs on sites you enable, and only on their
`/directory/` pages (where the analytics dashboards live). Remove a site
from the same popup at any time.

## Settings

Everything applies live — card style (large boxes / compact rows), cards per
row, text size, wallboard mode with height slider, auto-scroll speed and
pause, and Interacting-call styling. Settings sync with the browser profile.

## How it works

Pure CSS restyling of the widget's own table — the DOM is never modified, so
Genesys' live updates and per-second timers keep working. Auto-scroll drives
`scrollTop` on the widget's existing scroll container. Wallboard mode
re-slots the dashboard's layout grid with CSS only; disable it and the
dashboard returns to normal instantly.
