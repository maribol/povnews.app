<div align="center">

# POV News

### News scored against your point of view — on every new tab.

A new-tab Chrome extension that turns each new tab into a digest of what actually
matters to **you**. Every item carries a *why-this-matters-to-you* line, scored
against a point of view you define. Research runs on
[Cursor Cloud Agents](https://cursor.com/dashboard/cloud-agents) with **your own
API key** — there's no backend, and your data stays on your machine.

**Free & open source · MIT · You pay only your own Cursor API usage**

[Add to Chrome](https://chromewebstore.google.com/) ·
[How it works](#how-it-works) ·
[Privacy](#privacy)

</div>

---

## Why

Generic news feeds rank for engagement. POV News ranks for *relevance to you*:
you describe who you are and the pillars you care about, and every candidate
story is scored against that — then summarized with a one-line take on why it
matters to your specific situation.

## Features

- **Scored to your POV** — You define your role and 4–6 topic pillars. Every item
  is ranked against that, not against generic virality. High-signal items float up;
  noise drops.
- **No backend, your keys** — Research runs on Cursor Cloud Agents using your own
  API key. There are no servers to send your data to, because there are none.
- **Learns from a thumbs-up** — Rate items relevant or not. Your feedback becomes
  pro/anti examples that sharpen the next digest.
- **Calm three-pane reader** — Sources → scored items → reader pane. Familiar
  muscle memory, a fundamentally different data model.
- **Runs on a schedule** — A fresh digest is ready each morning; refresh manually
  any time.

## How it works

A four-step wizard builds your point of view the first time you open a new tab
(~3 minutes):

1. **About you** — Who you are and what problems you want news about, free-form.
2. **Pillars** — An agent suggests 4–6 topic pillars from your description. Edit or accept.
3. **Sources** — Pick a preset bundle or paste your own RSS / site URLs.
4. **Calibration** — Rate 10 sample items relevant or not. Your ratings teach the scorer.

Behind the scenes, each digest run:

1. **Discovers** candidates client-side from your sources (RSS / Reddit / HN) — no
   hallucinated URLs.
2. **Scores** them with a Cursor Cloud Agent against your POV and pillars.
3. **Writes** the final digest (title, summary, why-it-matters, score) back to your
   new tab as it streams in.

You can watch the whole run live, and review every past run — with its full
activity thread and the digest it produced — under the **Agent → Runs** view.

## Install

### From the Chrome Web Store

> _Listing link coming soon._

### From source (unpacked)

```bash
cd extension
npm install
npm run build        # production build → extension/dist
```

Then load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select **`extension/dist`**
4. Open a new tab. The POV wizard runs on first launch.
5. Add your Cursor API key under settings (toolbar gear / extension icon). Get one
   at [cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/cloud-agents).

## Development

```bash
cd extension
npm install
npm run dev          # vite build --watch
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build
```

The extension is MV3: a React new-tab app, a React settings page, and a background
service worker that drives discovery, the Cursor agent run, and all persistence.

### Repository structure

| Path | Purpose |
|------|---------|
| `extension/` | The MV3 Chrome extension (new-tab UI, settings, service worker) |
| `smoke-test/` | Node script that validates a no-repo Cursor cloud agent + `digest.json` artifact |

Site: [povnews.app](https://povnews.app)

## Privacy

POV News is local-first and has no backend:

- Your POV, digests, ratings, and run history live in `chrome.storage` on your machine.
- Your Cursor API key never leaves your browser except in calls you make to
  `api.cursor.com`.
- Article discovery fetches public RSS feeds and article pages directly from the
  browser; nothing is proxied through a server.
- No analytics, no tracking.

See the full [privacy policy](extension/public/privacy-policy.html).

## License

[MIT](LICENSE) © Samuel Todosiciuc
