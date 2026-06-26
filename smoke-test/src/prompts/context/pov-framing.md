# POV framing rules

Hard rules for how news candidates are filtered and how digest items are framed. Phase 1 uses these to disqualify candidates. Phase 2 uses them when writing `whyItMatters` and `summary`.

The user's actual POV (about text, pillars, audiences) lives in the injected **User POV** JSON — these rules apply that POV consistently.

---

## What a good digest item looks like

Each item should feel like it was picked for **this user**, not for a generic audience:

- grounded in problems the user actually works on
- tagged to one of their pillars with a clear angle
- written from the user's operator lens, not as neutral news recap
- specific enough that `whyItMatters` could only apply to someone with their POV

A digest item should **not** feel like:

- a competitor roundup or "X vs Y" take
- generic AI hype with no operator specificity
- SEO comparison content ("best [tool] alternative")
- a press release rewrite with no POV angle
- news that could appear in anyone's feed unchanged

---

## Rule 1 — User POV is the lens, not competitors

Score and frame items through the user's problems and decisions. Competitors are background context — never the main subject.

| Bad framing | Why it's wrong | Better framing |
|-------------|---------------|----------------|
| "[Competitor] can't do serious infrastructure." | Reactive, competitor-led | "Most tools in this category were designed for one layer. Operators at scale need the full stack to behave like one system." |
| "[Competitor]'s model is wrong." | Punches at a competitor by name | "The useful framing is the problem class — what breaks when the system doesn't connect journey to outcomes." |
| "Use [user's product] instead of [competitor]." | Sales pitch, not news curation | Describe the **problem class** the article exposes. Let the user connect it to their own work. |

**Hard rule:** if a candidate's only angle is reacting to a named competitor's announcement, drop it.

---

## Rule 2 — Avoid generic AI hype

Generic "AI will change everything" takes score low. AI-related items need **operator-specific** framing — implementation, business objects, and real outcomes the user cares about.

| Bad `whyItMatters` | Better `whyItMatters` |
|--------------------|----------------------|
| "AI will revolutionize marketing." | "AI only matters in marketing if it helps ship and measure actual tests — not just generate another headline." |
| "AI landing pages are the future." | "AI-generated pages are step one. The unlock is AI tied to offer, traffic source, checkout flow, and revenue outcomes." |
| "We added AI to our product." | "AI ideation is commoditized. AI execution — modifying real components and preserving tracking — is where leverage compounds." |

When an article touches AI: prefer the user's AI-related pillar if they have one. Default reframing:

> AI ideation is everywhere. AI implementation, connected to real business objects, is where the leverage is.

---

## Rule 3 — Avoid SEO content farm framing

These phrases signal low-value candidates — drop or heavily penalize:

- "best [category] tool"
- "[competitor] alternative"
- "top [category] software"
- "all-in-one platform" (also banned in `brand-voice.md`)
- "supercharge your [outcome]"

If the article's only thesis is a comparison listicle with no insight, disqualify it.

---

## Rule 4 — Lead with relevance, not recap

`whyItMatters` should answer: **why would this user care today?**

| Bad `whyItMatters` | Better `whyItMatters` |
|--------------------|----------------------|
| "Stripe announced new checkout features." | "If checkout data still doesn't reach your attribution stack, this is another handoff to audit." |
| "Meta updated ad policies." | "Policy shifts that affect tracking usually show up in CAC before they show up in your dashboard." |
| "A new AI writing tool launched." | "Another copy generator won't fix iteration speed once a page is live — watch for tools that change that." |

`summary` stays factual (2–3 sentences). `whyItMatters` carries the POV.

---

## Rule 5 — Preserve source URLs in metadata only

Every digest item includes the source `url` in JSON. Do **not** omit or substitute URLs.

When writing `summary` or `whyItMatters`, you may reference where the story came from ("a thread on r/PPC…", "Stripe's blog…") but the link lives in the item metadata — not woven into copy as a CTA or "read more" prompt.

---

## Pre-merge checklist (parent orchestrator)

Before finalizing `digest.json`, spot-check flagged items:

**Voice (from `brand-voice.md`):**

- [ ] `whyItMatters` is specific to the user's POV — not a generic news takeaway
- [ ] No analyst phrasing lifted verbatim from the source without reframing
- [ ] Concrete operator nouns where relevant — not abstract filler ("synergy", "digital transformation")

**Framing:**

- [ ] `pillarSlug` matches one pillar from User POV
- [ ] `audienceFit` matches one of the user's audiences
- [ ] No competitor name driving the angle
- [ ] No SEO-farm phrases (Rule 3 list)
- [ ] No banned words from `brand-voice.md`
- [ ] No fabricated stats or quotes — only what WebFetch verified
- [ ] If AI is the topic, operator-specific reframing is applied (Rule 2)
- [ ] Reddit pain language preserved verbatim in `quotableSnippet` when available

If an item fails multiple checks after one rewrite attempt, drop it rather than include a weak candidate.
