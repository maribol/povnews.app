import type { UserPOV } from "../types/pov";
import type { CandidateArticle } from "./feeds/feedTypes";
import { MAX_SUBAGENT_PROMPT_CHARS } from "./cursorClient";
import {
  filterSourcesForReader,
  resolveReaderPreferences,
} from "../utils/readerPreferences";

const rawModules = import.meta.glob("../../prompts/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function readPrompt(relativePath: string): string {
  const suffix = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  const key = Object.keys(rawModules).find((k) => k.endsWith(suffix));
  return key ? rawModules[key] : "";
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/);
  return match?.[0] ?? null;
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const norm = url.replace(/\/$/, "");
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(url);
  }
  return out;
}

function urlsFromAntiPatterns(antiPatterns: string[]): string[] {
  return dedupeUrls(
    antiPatterns.map(extractUrl).filter((u): u is string => Boolean(u)),
  );
}

function extractSourcesCategorySection(categorySlug: string, maxChars = 900): string {
  const full = readPrompt("context/sources.md");
  const marker = `### \`${categorySlug}\``;
  const start = full.indexOf(marker);
  if (start === -1) return "";
  const rest = full.slice(start + marker.length);
  const next = rest.search(/\n### /);
  const section = (next === -1 ? rest : rest.slice(0, next)).trim();
  return section.length <= maxChars ? section : `${section.slice(0, maxChars - 12)}\n[truncated]`;
}

function sourcesForCategory(pov: UserPOV, categorySlug: string, limit: number) {
  const byWeight = [...pov.sources].sort((a, b) => b.weight - a.weight);
  if (categorySlug === "reddit-pain-language") {
    return byWeight.filter((s) => s.url.includes("reddit.com")).slice(0, limit);
  }
  if (categorySlug === "ai-marketing") {
    const aiSlugs = new Set(["martech-stack-ai", "operator-saas-founders"]);
    const matched = byWeight.filter((s) => aiSlugs.has(s.pillarSlug));
    return (matched.length ? matched : byWeight).slice(0, limit);
  }
  return byWeight.filter((s) => !s.url.includes("reddit.com")).slice(0, limit);
}

function slimPovForSubagent(pov: UserPOV, categorySlug: string) {
  const readerPreferences = resolveReaderPreferences(pov);
  return {
    about: pov.about.slice(0, 280),
    audiences: pov.audiences,
    readerPreferences,
    pillars: pov.pillars.map((p) => ({
      slug: p.slug,
      name: p.name,
      description: p.description.slice(0, 80),
    })),
    sources: filterSourcesForReader(sourcesForCategory(pov, categorySlug, 5), readerPreferences),
    scoringRubric: pov.scoringRubric,
    /** URLs the user dismissed — do not re-include these stories. */
    avoidUrls: urlsFromAntiPatterns(pov.antiPatterns).slice(0, 5),
  };
}

function slimPovForParent(pov: UserPOV) {
  const readerPreferences = resolveReaderPreferences(pov);
  return {
    about: pov.about,
    audiences: pov.audiences,
    readerPreferences,
    pillars: pov.pillars,
    sources: filterSourcesForReader(
      [...pov.sources].sort((a, b) => b.weight - a.weight).slice(0, 18),
      readerPreferences,
    ),
    scoringRubric: pov.scoringRubric,
  };
}

function trimPrompt(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  return `${prompt.slice(0, maxChars - 20)}\n\n[trimmed]`;
}

export function buildSubagentPrompt(categorySlug: string, pov: UserPOV): string {
  const base = readPrompt("subagent.md");
  const filled = (base || `Research ${categorySlug}. Return JSON array.`).replaceAll(
    "{{category_slug}}",
    categorySlug,
  );
  const categoryGuide =
    extractSourcesCategorySection(categorySlug) ||
    `Research the "${categorySlug}" category using WebSearch and WebFetch.`;
  const minScore = pov.scoringRubric?.minScore ?? 6;
  const recencyDays = pov.scoringRubric?.recencyDays ?? 30;

  const build = (slim: ReturnType<typeof slimPovForSubagent>, guide: string) =>
    `${filled}

## Category research guide
${guide}

## Scoring
Score pillarFit, audienceFit, founderVoiceMatch, recency, conversationPotential (0–3 each, max 15). Drop total < ${minScore}. Recency: ${recencyDays} days.

## User POV
\`\`\`json
${JSON.stringify(slim)}
\`\`\``;

  let slim = slimPovForSubagent(pov, categorySlug);
  let prompt = build(slim, categoryGuide);

  if (prompt.length > MAX_SUBAGENT_PROMPT_CHARS) {
    slim = {
      ...slim,
      sources: slim.sources.slice(0, 3),
      avoidUrls: slim.avoidUrls.slice(0, 3),
      about: slim.about.slice(0, 180),
    };
    prompt = build(slim, categoryGuide.slice(0, 600));
  }

  return trimPrompt(prompt, MAX_SUBAGENT_PROMPT_CHARS);
}

export function buildParentPrompt(pov: UserPOV): string {
  let prompt = readPrompt("parent.md");
  if (!prompt) {
    prompt =
      "Orchestrate 3 subagents (reddit-pain-language, regulatory-platform-changes, ai-marketing), merge results, and output the full digest JSON in your final response.";
  }

  prompt = prompt
    .replace("{{brand-voice}}", readPrompt("context/brand-voice.md"))
    .replace("{{pillars}}", readPrompt("context/pillars.md"))
    .replace("{{pov-framing}}", readPrompt("context/pov-framing.md"))
    .replace("{{scoring-rubric}}", readPrompt("context/scoring-rubric.md"))
    .replace("{{sources}}", readPrompt("context/sources.md"))
    .replace("{{reader-preferences}}", readPrompt("context/reader-preferences.md"));

  const feedbackBlock = buildFeedbackBlock(pov);
  const povBlock = JSON.stringify(slimPovForParent(pov));
  return `${prompt}\n\n## User POV (inject into scoring and "what this means for you" / whyItMatters)\n\`\`\`json\n${povBlock}\n\`\`\`${feedbackBlock ? `\n\n${feedbackBlock}` : ""}`;
}

/** Candidate shape sent to the agent — compact, with a stable id. */
type ScoringCandidate = {
  id: string;
  url: string;
  title: string;
  source: string;
  published?: string;
  pillarSlug?: string;
  snippet?: string;
  engagement?: number;
};

function toScoringCandidates(candidates: CandidateArticle[], limit: number): ScoringCandidate[] {
  return candidates.slice(0, limit).map((c, i) => ({
    id: `c${i + 1}`,
    url: c.url,
    title: c.title.slice(0, 160),
    source: c.source,
    published: c.published?.slice(0, 10),
    pillarSlug: c.pillarSlug,
    snippet: (c.quote ?? c.summary)?.replace(/\s+/g, " ").trim().slice(0, 220),
    engagement: c.engagement,
  }));
}

/**
 * Scoring-mode prompt: the client already discovered REAL, verified articles.
 * The agent's only job is to score them against the user's POV, drop the weak
 * ones, and write the colloquial copy. It must NOT invent or search for URLs.
 */
export function buildScoringPrompt(
  pov: UserPOV,
  candidates: CandidateArticle[],
): string {
  const brandVoice = readPrompt("context/brand-voice.md");
  const povFraming = readPrompt("context/pov-framing.md");
  const scoringRubric = readPrompt("context/scoring-rubric.md");
  const minScore = pov.scoringRubric?.minScore ?? 6;

  const scoringCandidates = toScoringCandidates(candidates, 40);
  const povBlock = JSON.stringify(slimPovForParent(pov));
  const candidateBlock = JSON.stringify(scoringCandidates);
  const feedbackBlock = buildFeedbackBlock(pov);
  const pillarNames = pov.pillars.map((p) => `${p.slug} → ${p.name}`).join(", ");

  const prompt = `# Daily digest — scoring mode

You are curating a personal news digest. **A reliable client has already discovered and verified ${scoringCandidates.length} real, recent articles** from the user's own sources (RSS, Reddit, Hacker News). Your job is **scoring + writing**, not discovery.

## Hard rules
- Work ONLY from the CANDIDATES list below. **Do NOT invent URLs, do NOT WebSearch for new articles, do NOT add anything that isn't in the list.** Every output item's \`url\` must be copied verbatim from a candidate.
- You MAY use WebFetch on a candidate's own URL to read the full article and write a sharper summary — but only those exact URLs. Skipping the fetch and writing from the provided snippet is acceptable when time is tight.
- Keep the candidate's \`id\` and \`url\` exactly. Reuse the candidate \`id\` as the item \`id\`.
- Pillar slugs available: ${pillarNames}. Pick the best-fitting pillar for each item.

## Scoring (drop anything below ${minScore} / 15)
${scoringRubric || `Score pillarFit, audienceFit, founderVoiceMatch, recency, conversationPotential (0–3 each). Sum = score (max 15).`}

## Framing — who this is for
${povFraming}

## Voice — how to write summary, whyItMatters, quotableSnippet
${brandVoice}

The \`whyItMatters\` line is the most important field. Write it like a sharp friend who knows this person's work texting them why this specific story is worth their time — warm, direct, second person ("you"/"your"), concrete to their pillars and audience. No "yo", no slang, no corporate filler, no "this could be relevant if…". Be specific about the actual implication for them.

## User POV
\`\`\`json
${povBlock}
\`\`\`${feedbackBlock ? `\n\n${feedbackBlock}` : ""}

## CANDIDATES (score these — this is your entire universe)
\`\`\`json
${candidateBlock}
\`\`\`

## Output
Return ONLY a single JSON code block as your final message (no prose around it). Sort items by score, highest first. Keep the strongest 6–12 items; drop the rest.

\`\`\`json
{
  "generatedAt": "ISO-8601 timestamp",
  "items": [
    {
      "id": "<candidate id, e.g. c3>",
      "url": "<exact candidate url>",
      "title": "<cleaned headline>",
      "published": "<ISO date if known, else today>",
      "source": "<publication or r/subreddit>",
      "summary": "<1–2 sentence factual summary of what happened>",
      "whyItMatters": "<colloquial, specific, second-person — why THIS person should care>",
      "quotableSnippet": "<a sharp line worth quoting, <=200 chars>",
      "pillarSlug": "<one of the pillar slugs above>",
      "pillarName": "<matching pillar name>",
      "score": <number 0-15>,
      "scoreBreakdown": { "pillarFit": 0, "audienceFit": 0, "founderVoiceMatch": 0, "recency": 0, "conversationPotential": 0 },
      "audienceFit": "<which audience + why, one line>"
    }
  ]
}
\`\`\``;

  return prompt;
}

function buildFeedbackBlock(pov: UserPOV): string {
  const parts: string[] = [];
  const pros = dedupeUrls(pov.proExamples.map((e) => e.url))
    .slice(0, 5)
    .map((url) => {
      const ex = pov.proExamples.find((e) => e.url === url);
      const reason = ex?.reason.slice(0, 100) ?? "";
      return reason ? `- ${url} — ${reason}` : `- ${url}`;
    });

  const avoid = pov.antiPatterns.slice(0, 8).map((entry) => {
    const trimmed = entry.trim();
    return trimmed.length <= 220 ? `- ${trimmed}` : `- ${trimmed.slice(0, 217)}…`;
  });

  if (pros.length) {
    parts.push(
      '### Pro examples (good "what this means for you" lines — prefer similar framing)',
      ...pros,
    );
  }
  if (avoid.length) {
    parts.push(
      '### Dismissed URLs and bad personal-relevance lines (do not repeat)',
      ...avoid,
    );
  }
  if (!parts.length) return "";
  return `## Learned preferences (from user feedback)

User ratings judge the **"what this means for you"** line (\`whyItMatters\`), not just the headline:
- Thumbs up = the personal relevance line was sharp and accurate
- Thumbs down = the line was generic, wrong angle, or analyst-speak
- Topic dismiss = user not interested in this pillar/topic

${parts.join("\n")}`;
}

export function buildProfilePrompt(about: string, urls?: string[]): string {
  const template = readPrompt("profile-generator.md");
  const base = template || "Generate profile.json for this user.";

  let urlsSection = "";
  if (urls?.length) {
    urlsSection =
      "## User-provided URLs\n\n" +
      urls.map((u) => `- ${u}`).join("\n") +
      "\n\nThese are the user's own sites/products. Research them thoroughly.";
  }

  return base
    .replace("{{about}}", about)
    .replace("{{urls_section}}", urlsSection);
}

export function profileSubagentDefinitions(
  about: string,
  urls?: string[],
): import("./cursorClient").SubagentInput[] {
  const urlList = urls?.length
    ? urls.map((u) => `- ${u}`).join("\n")
    : "(No URLs provided — skip website research, focus on the description.)";

  return [
    {
      name: "business-researcher",
      description:
        "Visits the user's website(s) and linked pages to build a structured brief about their business.",
      prompt: `You are a business research analyst for a **news digest** setup — not a sales researcher.

Your job: understand what external news this person needs to track. Product details are context only.

## URLs to research
${urlList}

## User description
${about}

## Instructions

1. Visit each URL. Read homepage, about, pricing, blog (3–5 posts), docs/features.
2. Extract **decision domains** (what they allocate budget/time to) and **news interests** (what changing in the world would make them stop and read).
3. Do NOT produce marketing copy. Summarize factually.

Return JSON directly in your response (no files):

\`\`\`json
{
  "companyName": "...",
  "role": "founder | operator | etc.",
  "domain": "Primary industry in plain language",
  "targetCustomer": "Who they build/sell for — one sentence",
  "decisionDomains": ["budget areas and operational domains they own — e.g. paid media, checkout, compliance"],
  "newsInterests": ["types of external news that would affect their decisions — not product features"],
  "platformsAndStack": ["ad platforms, PSPs, tools they depend on — for source discovery"],
  "keyTopics": ["5–8 topic keywords for news filtering"],
  "businessModel": "SaaS / agency / ecommerce / etc."
}
\`\`\`

Be factual — only include what you found. Don't hallucinate.
Output JSON in your response — do NOT write files.`,
    },
    {
      name: "source-scout",
      description:
        "Discovers real, active newsletters, blogs, subreddits, and publications relevant to the user's niche.",
      prompt: `You are a source discovery specialist for a **daily news digest** — find sources this person would read to stay informed, not sources that mention their product.

## Who this person is
${about}

## Instructions

Find **12–20 real, currently active** sources. Verify URLs are reachable.

**Balance source types** (don't return 15 marketing blogs):
- **Platform primary** (3–5): official policy/changelog/developer blogs for platforms in their stack (Google Ads, Meta, Apple, Stripe, Shopify, etc. — pick what's relevant)
- **Practitioner communities** (2–4): subreddits, forums where operators discuss problems
- **Trade publications** (2–4): industry news, not listicles
- **Newsletters/blogs** (3–6): operator-grade, actively publishing

Prefer sources that produce **news and policy updates**, not evergreen SEO content.

Return JSON directly in your response (no files):

\`\`\`json
{
  "sources": [
    {
      "url": "https://...",
      "name": "Source name",
      "type": "platform | subreddit | newsletter | blog | publication",
      "description": "What news this source produces",
      "suggestedPillar": "kebab-case decision domain — broad, not product-specific",
      "quality": 1
    }
  ]
}
\`\`\`

Rules:
- Every URL must be real. Verify by visiting.
- quality: 1.0 = essential weekly read, 0.7 = good supplemental, 0.5 = occasional
- suggestedPillar = broad decision lens (e.g. "paid-media-policy", not "my-product-category")
- No generic TechCrunch unless truly relevant
- Prefer primary sources and practitioner voices over thought-leadership fluff

Output JSON in your response — do NOT write files.`,
    },
  ];
}

export function subagentDefinitions(pov: UserPOV): import("./cursorClient").SubagentInput[] {
  const categories = [
    "reddit-pain-language",
    "regulatory-platform-changes",
    "ai-marketing",
  ] as const;

  return categories.map((slug) => ({
    name: slug,
    description: `Research source category: ${slug}`,
    prompt: buildSubagentPrompt(slug, pov),
  }));
}
