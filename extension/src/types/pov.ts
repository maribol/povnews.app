export type PillarAccent =
  | "slate"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "cyan";

export type UserPOV = {
  about: string;
  pillars: Array<{
    slug: string;
    name: string;
    description: string;
    accent: PillarAccent;
  }>;
  audiences: string[];
  sources: Array<{ url: string; pillarSlug: string; weight: number }>;
  scoringRubric: { recencyDays: number; minScore: number };
  antiPatterns: string[];
  proExamples: Array<{ url: string; reason: string }>;
  voiceSamples: string[];
  readerPreferences?: ReaderPreferences;
};

export type ReaderTechnicalDepth = "business" | "mixed" | "technical";

export type ReaderPreferences = {
  technicalDepth: ReaderTechnicalDepth;
  /** Include API changelogs, developer docs, SDK release notes */
  includeDeveloperSources: boolean;
  setupAnswers?: Record<string, boolean>;
  notes?: string;
};

export type SetupQuestion = {
  id: string;
  question: string;
  defaultYes: boolean;
  hint?: string;
};

export type ScoreBreakdown = {
  pillarFit: number;
  audienceFit: number;
  founderVoiceMatch: number;
  recency: number;
  conversationPotential: number;
};

export type DigestItem = {
  id: string;
  url: string;
  title: string;
  published: string;
  source: string;
  summary: string;
  whyItMatters: string;
  quotableSnippet: string;
  pillarSlug: string;
  pillarName: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  audienceFit: string;
  /** og:image / twitter:image from source page */
  imageUrl?: string;
  /** Site favicon from source page */
  faviconUrl?: string;
};

export type DigestPillarSummary = {
  slug: string;
  name: string;
  itemCount: number;
};

export type Digest = {
  generatedAt: string;
  runId?: string;
  pillars: DigestPillarSummary[];
  items: DigestItem[];
};

export type ItemRating = "up" | "down" | "dismiss";

export type ViewMode = "list" | "compact" | "grid";

export type RunKind = "digest" | "profile" | "calibration";

export type ProfileDraft = {
  about: string;
  pillars: UserPOV["pillars"];
  audiences: string[];
  sources: UserPOV["sources"];
  readerPreferences?: ReaderPreferences;
  setupQuestions?: SetupQuestion[];
};

export type RunStatus = "idle" | "running" | "failed" | "succeeded";

/** Stage of a digest run, so the UI can show what the agent is actually doing. */
export type RunPhase = "discovering" | "scoring" | "writing" | "done";

export type AgentRunState = {
  status: RunStatus;
  kind?: RunKind;
  trigger?: "manual" | "scheduled";
  agentId?: string;
  runId?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  resultText?: string;
  durationMs?: number;
  activityLog?: import("../storage/schema").ActivityEntry[];
  streamBuffer?: string;
  streamingItemCount?: number;
  itemCount?: number;
  /** Staged digest progress. */
  phase?: RunPhase;
  /** How the candidates were sourced for this run. */
  discoveryMode?: "client" | "agent";
  sourcesScanned?: number;
  candidatesFound?: number;
  itemsWritten?: number;
};

export type RunHistoryEntry = {
  id: string;
  kind: RunKind;
  status: "running" | "succeeded" | "failed" | "cancelled";
  trigger?: "manual" | "scheduled";
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  itemCount?: number;
  activityLog?: import("../storage/schema").ActivityEntry[];
  activitySummary?: string;
};

export type PillarDriftAlert = {
  pillarSlug: string;
  pillarName: string;
  downRate: number;
  days: number;
};

export type ArticleContent = {
  title: string;
  contentHtml: string;
  excerpt?: string;
  byline?: string;
  publishedTime?: string;
};
