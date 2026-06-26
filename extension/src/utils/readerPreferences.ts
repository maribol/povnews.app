import type {
  ReaderPreferences,
  ReaderTechnicalDepth,
  SetupQuestion,
  UserPOV,
} from "../types/pov";

const TECH_ROLE_RE =
  /\b(engineer|engineering|developer|devops|backend|frontend|fullstack|software|cto|technical|programmer|architect)\b/i;
const BUSINESS_ROLE_RE =
  /\b(marketer|marketing|operator|founder|media buyer|affiliate|ecommerce|growth|pm\b|product manager|merchant|trader|buyer)\b/i;
const TECH_TOPIC_RE =
  /\b(api|sdk|changelog|release notes|developer docs|enum|graphql|rest api|webhook|engineering backlog)\b/i;

const DEV_SOURCE_PATTERNS = [
  /developers?\./i,
  /\/docs\/api\b/i,
  /\/release-notes\b/i,
  /\/changelog\b/i,
  /developer\.apple/i,
  /cloud\.google\.com\/.*\/docs/i,
  /learn\.microsoft\.com\/.*\/api/i,
  /ads\.google\.com\/.*\/api/i,
];

export function inferReaderPreferences(
  about: string,
  audiences: string[] = [],
): ReaderPreferences {
  const text = `${about} ${audiences.join(" ")}`;

  let technicalDepth: ReaderTechnicalDepth = "mixed";
  const tech = TECH_ROLE_RE.test(text);
  const business = BUSINESS_ROLE_RE.test(text);
  if (tech && !business) technicalDepth = "technical";
  else if (business && !tech) technicalDepth = "business";

  return {
    technicalDepth,
    includeDeveloperSources: technicalDepth !== "business",
  };
}

export function defaultSetupQuestions(
  prefs: ReaderPreferences,
): SetupQuestion[] {
  return [
    {
      id: "developer-sources",
      question: "Include API changelogs and developer release notes?",
      defaultYes: prefs.includeDeveloperSources,
      hint:
        prefs.technicalDepth === "business"
          ? "Your profile reads as business/operator-focused — most people like you skip raw API docs."
          : undefined,
    },
    {
      id: "business-framing",
      question: "Write “what this means for you” in plain business language (not engineering detail)?",
      defaultYes: prefs.technicalDepth !== "technical",
    },
  ];
}

export function readerPreferencesFromSetup(
  technicalDepth: ReaderTechnicalDepth,
  includeDeveloperSources: boolean,
  setupAnswers: Record<string, boolean>,
): ReaderPreferences {
  let depth = technicalDepth;
  let includeDev = includeDeveloperSources;

  if (setupAnswers["developer-sources"] === false) includeDev = false;
  if (setupAnswers["developer-sources"] === true) includeDev = true;
  if (setupAnswers["business-framing"] === true && depth === "mixed") depth = "business";
  if (setupAnswers["business-framing"] === false && depth === "mixed") depth = "technical";

  if (depth === "business") includeDev = false;

  return { technicalDepth: depth, includeDeveloperSources: includeDev, setupAnswers };
}

export function resolveReaderPreferences(pov: UserPOV): ReaderPreferences {
  return pov.readerPreferences ?? inferReaderPreferences(pov.about, pov.audiences);
}

export function isDeveloperSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const haystack = `${u.hostname}${u.pathname}`;
    return DEV_SOURCE_PATTERNS.some((pattern) => pattern.test(haystack));
  } catch {
    return false;
  }
}

export function filterSourcesForReader<T extends { url: string }>(
  sources: T[],
  prefs: ReaderPreferences,
): T[] {
  if (prefs.includeDeveloperSources) return sources;
  return sources.filter((s) => !isDeveloperSourceUrl(s.url));
}

export function isTechnicalNewsCandidate(text: string): boolean {
  return TECH_TOPIC_RE.test(text);
}

export function initialSetupAnswers(questions: SetupQuestion[]): Record<string, boolean> {
  return Object.fromEntries(questions.map((q) => [q.id, q.defaultYes]));
}
