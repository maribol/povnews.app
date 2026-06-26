import type { CandidateArticle } from "./feedTypes";
import { fetchJson, fetchText } from "./http";
import { parseFeed } from "./rssParser";
import { safeHostname } from "../../utils/url";

export function isRedditUrl(url: string): boolean {
  const host = safeHostname(url);
  return host === "reddit.com" || host.endsWith(".reddit.com");
}

/** Build a Reddit JSON listing endpoint from a subreddit / user / search URL. */
export function redditJsonUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");

    if (path.endsWith(".json")) return u.href;

    const sub = path.match(/^\/r\/([^/]+)/i);
    if (sub) {
      return `https://www.reddit.com/r/${sub[1]}/top.json?t=week&limit=25&raw_json=1`;
    }
    const user = path.match(/^\/(?:u|user)\/([^/]+)/i);
    if (user) {
      return `https://www.reddit.com/user/${user[1]}/submitted.json?sort=top&t=month&limit=25&raw_json=1`;
    }
    return `${u.origin}${path}/top.json?t=week&limit=25&raw_json=1`;
  } catch {
    return null;
  }
}

/** Reddit-wide keyword search (used when the user has no Reddit sources). */
export function redditSearchUrl(query: string): string {
  return `https://www.reddit.com/search.json?q=${encodeURIComponent(
    query,
  )}&sort=top&t=week&limit=15&raw_json=1`;
}

type RedditChild = {
  data?: {
    title?: string;
    permalink?: string;
    url?: string;
    selftext?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    subreddit?: string;
    author?: string;
    over_18?: boolean;
    stickied?: boolean;
    is_self?: boolean;
  };
};

type RedditListing = { data?: { children?: RedditChild[] } };

function firstSentences(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function mapRedditChild(child: RedditChild): CandidateArticle | null {
  const d = child.data;
  if (!d || !d.title || !d.permalink || d.over_18 || d.stickied) return null;

  const url = `https://www.reddit.com${d.permalink}`;
  const selftext = d.selftext?.trim() ?? "";
  const publishedMs = d.created_utc ? d.created_utc * 1000 : undefined;

  return {
    url,
    title: d.title,
    source: d.subreddit ? `r/${d.subreddit}` : "reddit",
    published: publishedMs ? new Date(publishedMs).toISOString() : undefined,
    publishedMs,
    summary: selftext ? firstSentences(selftext) : d.title,
    author: d.author,
    engagement: d.score,
    comments: d.num_comments,
    quote: selftext ? firstSentences(selftext, 320) : undefined,
    origin: "reddit",
  };
}

/** Fetch Reddit candidates via JSON; fall back to the .rss feed on 403/timeout. */
export async function fetchRedditCandidates(
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<CandidateArticle[]> {
  const jsonUrl = redditJsonUrl(sourceUrl);
  if (jsonUrl) {
    try {
      const listing = await fetchJson<RedditListing>(jsonUrl, signal);
      const children = listing.data?.children ?? [];
      const mapped = children
        .map(mapRedditChild)
        .filter((c): c is CandidateArticle => c !== null);
      if (mapped.length) return mapped;
    } catch {
      /* fall back to rss */
    }
  }

  // .rss fallback (works when JSON is rate-limited)
  try {
    const rssUrl = jsonUrl
      ? jsonUrl.replace(/\.json.*$/, "/.rss?t=week")
      : `${sourceUrl.replace(/\/+$/, "")}/.rss`;
    const body = await fetchText(rssUrl, signal);
    return parseFeed(body)
      .filter((item) => item.link && item.title)
      .map((item) => ({
        url: item.link!,
        title: item.title!,
        source: "reddit",
        published: item.published,
        publishedMs: item.published ? Date.parse(item.published) || undefined : undefined,
        summary: item.summary,
        author: item.author,
        origin: "reddit" as const,
      }));
  } catch {
    return [];
  }
}
