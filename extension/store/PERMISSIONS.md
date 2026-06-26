# Chrome Web Store — permissions justification

## `storage`

Persists your POV configuration, digest history (up to 90 runs), item ratings, theme preference, and Cursor API key locally. Required for the product to work offline after a digest completes.

## `alarms`

Schedules the daily 7:00 AM digest run and polls Cursor Cloud Agent status without keeping the service worker alive (MV3 30s lifetime limit).

## Host: `https://api.cursor.com/*`

Direct REST calls to Cursor Cloud Agents API using your BYO API key. No proxy server. Required for digest generation and AI-assisted pillar suggestions.

## Host: `https://*/*` and `http://*/*`

Used only when you click **Read in extension** to fetch article HTML for the in-tab reader (Mozilla Readability). No background crawling.

## New tab override

Replaces the new tab page with the three-pane digest UI (core product surface).
