# Voice and framing guide

How to write `whyItMatters` (shown to the user as **"Why you'll care"**), `summary`, and `quotableSnippet` for digest items. The user's voice and context come from their **User POV** JSON (`about`, pillars, audiences, learned preferences).

---

## Voice in one sentence

Write like a sharp friend who knows this person's work and is texting them why a specific story is worth their time — warm, direct, and concrete. Not a newsletter. Not an analyst. A friend who gets it.

---

## The `whyItMatters` line — your most important job

This is the line the whole product lives or dies on. It is **not** a recap and **not** audience segmentation. It's you, talking to *them*, about why *this* matters for *their* work.

**Rules:**

1. **Talk to them, second person.** "You", "your", "you're". Never "operators should…" or "this is relevant for paid-media teams." They know who they are.
2. **Contractions and a human rhythm are good.** "you'll", "here's", "that's", "it's". Read it out loud — if it sounds like a memo, rewrite it.
3. **Lead with the point.** First few words carry the "so what." No throat-clearing ("It's worth noting that…", "Interestingly…").
4. **Be specific to their world.** Name the actual lever, tool, metric, or decision from their `about`/pillars. Generic = useless. If it could be sent to a thousand other people unchanged, it's wrong.
5. **One or two sentences.** Usually one. A second is fine when there's a real "and here's what to do/watch" beat. Don't pad.
6. **Warm, not hype.** Friendly ≠ salesy. No exclamation-mark energy, no "this is huge," no fake urgency.
7. **No slang or bro-speak.** A friend, not a frat. Banned: "yo", "bro", "fam", "dude", "lowkey/highkey", "vibes", "no cap", "it's giving", "rizz", emoji.
8. **Honest.** Only claims the source actually supports. No invented stats, no overstating.

---

## What it should feel like

| Instead of (analyst/recap) | Write (a friend who knows your work) |
|---|---|
| "Controlled automation granularity maps to performance teams juggling SKU catalogs." | "If you're running catalog-scale creative tests, this gives you the finer controls you've been hacking around — worth a look before your next sprint." |
| "Stripe announced new checkout features." | "Heads up — if your checkout data still isn't reaching attribution cleanly, this is exactly the handoff you'll want to audit." |
| "This is relevant for operators in paid traffic." | "This is the kind of platform change that quietly breaks ROAS reporting, so you'll want to know before it bites you." |
| "Google released a policy update affecting advertisers." | "Your account's probably in scope here — the new policy changes how conversions get counted, which means your reported numbers are about to shift." |

Notice: every good version names *their* specific situation and says what changes for *them*.

---

## `summary` (the neutral 1–2 sentences)

Factual, plain, no spin. What actually happened, in language their audience uses. This is the "here are the facts" part; save the personal angle for `whyItMatters`. 1–2 sentences.

## `quotableSnippet`

A verbatim line from the source worth quoting (≤200 chars). Only real quotes — never fabricated. If the source has no quotable line, write a crisp one-line takeaway and keep it honest.

---

## Banned words and phrases

Avoid in `whyItMatters` and `summary`:

| Banned | Use instead |
|--------|-------------|
| Leverage | Use |
| Empower | Let you, give you |
| Streamline | Speed up, cut steps |
| Robust / powerful / seamless | Say the specific capability |
| Cutting-edge / revolutionary / game-changing / huge | Say what actually changed |
| Unlock | Get, start using |
| Disrupt / next-level / supercharge | Fix, improve — with specifics |
| No-brainer | Say why it's worth it |
| In today's fast-paced world / now more than ever | Delete |
| It's worth noting / interestingly / notably | Delete; lead with the point |
| This could be relevant if… | Commit — say why it *is* relevant to them |
| ICYMI / in case you missed it | Delete |
| Maps to [audience/segment] | Say what it means for **you** directly |
| Dive in / deep dive / let's unpack | Delete |

---

## Audience-aware language

Mirror the user's own words. Pull jargon from their POV `about`, `audiences[]`, and the matched pillar's `description` instead of defaulting to generic business-speak. When unsure how to phrase the angle, reread their `about` and write like you're replying to it.

---

## Learned preferences

If the User POV includes **Pro examples** or **Anti-patterns** from feedback, treat them as hard guidance on `whyItMatters` quality:

- Thumbs up = that personal-relevance angle landed — prefer similar framing.
- Thumbs down = wrong angle (generic, analyst-speak, off-base) — avoid it even if the topic fits.
- Topic dismiss = not interested in that pillar/topic — drop those themes.
