# Content pillars

Every digest item must map to **exactly one** pillar from the user's **User POV** JSON. The pillar determines the angle — the article is the news hook.

Do not invent pillar slugs. Use only slugs defined in User POV `pillars[]`.

---

## How to pick a pillar

1. Read the candidate article or thread.
2. Ask: which user pillar's **core problem** does this news touch?
3. Tag that pillar's `slug` as `pillarSlug` and its `name` as `pillarName`.
4. Write `whyItMatters` from that pillar's angle — not from the article's generic headline.

If no pillar fits cleanly, the candidate is **not** a match. Drop it.

---

## Pillar fit signals

Use the user's pillar `description` field as the primary guide. These patterns help when descriptions are brief:

| Signal in the news | Often maps to pillars about… |
|--------------------|------------------------------|
| Integrations breaking, data not syncing, handoff failures | Stack gaps, revenue between tools, ops friction |
| CAC, ROAS, attribution, unit economics | Profitability, measurement, scaling decisions |
| Checkout, testing, conversion mechanics | Infrastructure, product surface, growth systems |
| AI agents, copilots, automation in workflows | AI execution, implementation vs ideation |
| Founder/builder lessons, scaling pain, internal tooling | Operator experience, lessons from the field |
| How AI products are built, product-native AI | Product building, AI-native architecture |

When an article could plausibly hook multiple pillars, prefer:

1. The pillar most central to the user's `about` text
2. The pillar with the sharper, less obvious angle
3. The pillar that produces a more specific `whyItMatters` line

---

## Pillar diversity in the digest

The final digest should span the user's interests — not cluster in one theme.

- Cover **at least 3 distinct pillars** in the final 15–25 items
- If trending news concentrates in one pillar, include lower-scored items from underrepresented pillars rather than publishing 10 variations of the same angle
- Apply anti-monotony rules from `scoring-rubric.md`
