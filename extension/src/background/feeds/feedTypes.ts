/** Where a candidate originated. */
export type FeedKind = "rss" | "reddit" | "hn";

/** A source we will try to pull fresh articles from. */
export type FeedSource = {
  /** Original URL (feed, site, subreddit, or search seed). */
  url: string;
  kind: FeedKind;
  /** Pillar this source is tagged to in the user's POV, if any. */
  pillarSlug?: string;
  /** Higher = checked first. */
  weight: number;
  /** Human label for activity logs. */
  label: string;
};

/**
 * A real, verified article candidate found client-side (no LLM involved).
 * These are handed to the cloud agent for scoring + personalization.
 */
export type CandidateArticle = {
  url: string;
  title: string;
  /** Domain or r/subreddit. */
  source: string;
  /** ISO date if known. */
  published?: string;
  publishedMs?: number;
  /** Plain-text snippet (description / selftext / story text), trimmed. */
  summary?: string;
  author?: string;
  /** Best-guess pillar slug from the user's POV. */
  pillarSlug?: string;
  /** Engagement signal (Reddit upvotes / HN points). */
  engagement?: number;
  comments?: number;
  /** Verbatim pain-language candidate (Reddit selftext / top text). */
  quote?: string;
  origin: FeedKind;
};

export type DiscoveryResult = {
  candidates: CandidateArticle[];
  sourcesScanned: number;
  sourcesOk: number;
  errors: string[];
};
