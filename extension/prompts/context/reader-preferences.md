# Reader preferences

The injected **User POV** JSON may include `readerPreferences`. Use it to filter candidates and write `whyItMatters` ("what this means for you") at the right depth.

## Fields

| Field | Values | Meaning |
|-------|--------|---------|
| `technicalDepth` | `business` \| `mixed` \| `technical` | How technical the reader is |
| `includeDeveloperSources` | boolean | Whether API changelogs / developer docs belong in the digest |

## When `technicalDepth` is `business`

**Drop or heavily penalize** (total &lt; 9):

- API version bumps, SDK releases, enum additions, developer-only changelogs
- Stories whose only hook is "new API field" or "experiment type enum"
- Items that require reading code or release-note diffs to matter

**Prefer instead:**

- Policy, pricing, enforcement, market, and operator-practice news
- Platform changes explained as **budget, workflow, or risk** impact — not engineering tasks

**`whyItMatters` must:**

- Avoid jargon: no "enums", "hooks", "release hygiene", "staging rollouts in code"
- State business impact: spend, compliance, creative workflow, attribution, conversion

| Bad (too technical for business reader) | Better |
|----------------------------------------|--------|
| "Your engineering backlog should treat these enums as part of release hygiene." | "If you rely on Google’s automated bidding experiments, this changes what you can test without a dev ticket." |
| "Added `ADOPT_AI_MAX` experiment type in API v24.1." | "Google added a new way to test AI Max — worth knowing if you run in-house experiment workflows." |

## When `technicalDepth` is `technical`

- API/changelog items are in scope when they affect systems the user runs
- `whyItMatters` may reference implementation — still tie to **their** stack

## When `includeDeveloperSources` is `false`

- Do not source from developer docs, API release-note pages, or changelog-only URLs
- If a policy story appears on a developer blog, include only when the **business/policy angle** is clear without API detail

## Setup answers (optional)

If `readerPreferences.setupAnswers` is present:

- `developer-sources: false` → treat as `includeDeveloperSources: false`
- `business-framing: true` → enforce plain-language `whyItMatters`
