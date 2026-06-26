# Research sources

How subagents find news candidates for the POV News digest. **User POV** JSON is the primary source of truth — category slugs are research lenses, not fixed publication lists.

> **Context:** The primary digest path discovers real articles client-side (RSS/Reddit/Hacker News) and the agent just scores them. This guide applies to the **fallback** path, when that layer returns nothing and subagents must find candidates via WebSearch/WebFetch. Verify every URL.

---

## User POV sources (check first)

For every assigned category:

1. Scan User POV `sources[]` — prefer higher `weight` URLs
2. WebFetch each reachable source for recent posts in the recency window
3. Tag candidates with the source's `pillarSlug` when the fit is clear
4. If the user's list is thin for this category, supplement with **WebSearch** using keywords from User POV `about`, pillar names, and pillar descriptions

Never ignore the user's configured sources in favor of a generic publication list.

---

## Default digest categories (MVP)

The parent orchestrator assigns each subagent one category slug below.

### `reddit-pain-language`

Find how people in the user's domain describe problems in **their own words** on Reddit.

**Recency:** last 7 days, sort by Top.

**Where to look:**

1. Subreddits from User POV `sources[]` that point to `reddit.com`
2. WebSearch: `[niche keywords from User POV] site:reddit.com` (derive keywords from `about` and pillars)
3. Related subreddits surfaced by search — verify they match the user's audience

**Search themes:** derive from User POV pillar descriptions and `about` text — not a fixed keyword list. Look for threads where the OP describes a specific problem, failure, or workaround.

**Reddit candidate fields:**

- `url` = thread permalink (public, not deleted)
- `title` = thread title (verbatim)
- `summary` = factual context plus pain language from OP and top comments
- `quotableSnippet` = verbatim pain language (highest-signal quote)
- `whyItMatters` = one **"what this means for you"** sentence — direct implication for the user's work, tied to a User POV pillar
- `audienceFit` = derived from subreddit + thread context

Reddit threads with strong pain language often outscore polished articles. Don't downgrade Reddit because it isn't a "publication".

---

### `regulatory-platform-changes`

Policy, platform, and regulatory shifts that affect the user's industry.

**Recency:** last 30 days.

**Where to look:**

1. User POV `sources[]` that cover news, policy, or industry publications
2. WebSearch for recent announcements from platforms and regulators **relevant to User POV** — derive which platforms matter from `about`, pillars, and sources (e.g. ad platforms, app stores, payment processors, compliance regimes)
3. Official changelogs, enforcement actions, privacy updates, terms-of-service changes

Prioritize changes that would affect decisions the user actually makes — not generic tech policy news unrelated to their POV.

---

### `ai-marketing`

AI-related news with **operator-specific** relevance to the user's POV — not generic "AI will change everything" hype.

**Recency:** last 30 days.

**Where to look:**

1. User POV `sources[]` assigned to AI-related or tech pillars
2. WebSearch for AI developments in the user's niche (use pillar descriptions + `about`)
3. Product launches, research, and tooling only when they connect to problems the user's pillars cover

Apply `pov-framing.md` Rule 2 — drop pure hype.

---

## Optional category slugs

If the parent orchestrator assigns additional categories later, use the same pattern:

1. Start with User POV `sources[]` whose `pillarSlug` matches the category bias
2. WebSearch for fresh items using User POV keywords
3. Tag to User POV pillars only — do not invent slugs

**Competitor sources:** if the user follows competitor blogs, treat them as **background context only** — never let a competitor be the item's main subject (see `pov-framing.md` Rule 1).

**Aggregators** (HN, Product Hunt, X threads): useful when filtered through User POV — only include items that clearly map to a pillar.

---

## Recency window

Default: **last 30 days** for articles. Reddit: **last 7 days**. Override when User POV `scoringRubric.recencyDays` is set.

Hard drop: >60 days old (Reddit: >14 days).

---

## Disqualifiers (drop, don't return)

- Published outside the recency window
- URL behind a hard paywall (no public excerpt)
- Pure press release with no analytical content
- Listicle with no thesis ("Top 10 [category] tools in 2026")
- Vendor blog reading like ad copy with no insight
- Same thesis as an item in User POV `antiPatterns[]`
- **Competitor-reactive only** — see `pov-framing.md` Rule 1
- **AI-hype only** — see `pov-framing.md` Rule 2
