# Scoring rubric

Used by subagents (self-score per candidate) and the parent orchestrator (rerank merged shortlist).

Pillar slugs and audiences must come from the injected **User POV** JSON.

## Pre-scoring disqualifiers (drop before scoring)

A candidate is dropped before scoring if any of these apply (see `pov-framing.md` and `sources.md`):

- **Competitor-reactive only**: only angle is "respond to what [competitor] said/did"
- **AI hype only**: generic "AI will change marketing" with no operator specificity
- **SEO-farm framing only**: item would center on "best [X] alternative" or similar
- **No pillar fit**: cannot be cleanly mapped to any pillar in User POV
- **Source unverified**: `WebFetch` failed
- **Recency**: >60 days old (Reddit: >14 days), unless User POV overrides
- **User anti-pattern**: matches a dismissed angle in User POV `antiPatterns[]`
- **Wrong technical depth**: see `reader-preferences.md` — if `readerPreferences.technicalDepth` is `business`, drop API/changelog-only items and pure developer release notes
- **Developer source excluded**: if `includeDeveloperSources` is `false`, drop items sourced primarily from API release notes or developer doc pages

## Sub-scores (each 0-3)

| Sub-score | What it measures | 3 = | 0 = |
|-----------|-----------------|-----|-----|
| `pillarFit` | How cleanly does this map to one User POV pillar? | Obvious fit; angle writes itself | Forced or weak fit |
| `audienceFit` | Is one of the user's audiences clearly the reader? | One audience is unambiguous | Could be anyone |
| `founderVoiceMatch` | Does `whyItMatters` ("what this means for you") land as a direct implication for this user? | One specific sentence they could act on or nod at — not analyst segmentation | Generic recap, "maps to [segment]", or could apply to anyone |
| `recency` | How fresh is the news hook? | Last 7 days OR resurfaced/contested this week | Last 30-60 days, no fresh debate |
| `conversationPotential` | Will this item be useful in the user's digest? | Contested claim, novel data, or unresolved tension they'd act on | Mild, universal-agreement filler |

## Total score

Sum of the five sub-scores. Range: 0-15.

| Total | Action |
|-------|--------|
| 12-15 | Strong include. Almost always shortlist. |
| 9-11 | Include if shortlist isn't already full. |
| 6-8 | Backup only. |
| 0-5 | Drop. |

Respect User POV `scoringRubric.minScore` as the merge threshold when set (default: 9).

## Reddit candidate adjustment

Reddit threads with strong pain language in the OP or top comments get **+1 to `founderVoiceMatch`** because they surface quotable operator language. Apply only when the pain language is specific enough for `quotableSnippet`. Cap sub-scores at 3.

## Merge rerank rules (parent orchestrator)

After summing scores:

1. **Dedupe by URL.** One entry per URL.
2. **Dedupe by thesis.** If two candidates make the same core point, keep the highest scorer.
3. **Pillar diversity constraint.** Final digest (15–25 items) must cover **at least 3 distinct pillars** from User POV. If top-N concentrates in one pillar, swap in lower-ranked candidates from underrepresented pillars.
4. **Audience diversity constraint.** At least 3 distinct audiences across the final digest.
5. **Anti-monotony on trending topics.** No more than 2 items on the same narrow theme (e.g. one AI product launch, one generic AI trend) even if many articles trended this week.
6. **Anti-monotony on competitors.** No more than 1 candidate per named competitor across the whole digest (and that one must still be reframed per `pov-framing.md` Rule 1).
7. **Freshness tiebreak.** Score ties → prefer more recent.
