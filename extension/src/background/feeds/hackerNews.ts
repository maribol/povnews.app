import type { CandidateArticle } from "./feedTypes";
import { fetchJson } from "./http";

type HnHit = {
  objectID: string;
  title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  created_at?: string;
  created_at_i?: number;
  author?: string;
  story_text?: string | null;
};

type HnResponse = { hits?: HnHit[] };

/**
 * Hacker News front-page-quality stories matching a keyword, within a window.
 * Uses the public Algolia HN Search API (no key required).
 */
export async function fetchHnCandidates(
  query: string,
  opts: { minPoints?: number; sinceDays?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<CandidateArticle[]> {
  const { minPoints = 40, sinceDays = 21, limit = 12, signal } = opts;
  const cutoff = Math.floor(Date.now() / 1000) - sinceDays * 86400;

  const url =
    `https://hn.algolia.com/api/v1/search_by_date?tags=story` +
    `&query=${encodeURIComponent(query)}` +
    `&numericFilters=points>${minPoints},created_at_i>${cutoff}` +
    `&hitsPerPage=${limit}`;

  try {
    const data = await fetchJson<HnResponse>(url, signal);
    const hits = data.hits ?? [];
    return hits
      .filter((h) => h.title)
      .map((h) => {
        const publishedMs = h.created_at_i ? h.created_at_i * 1000 : undefined;
        return {
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          title: h.title!,
          source: h.url ? hostLabel(h.url) : "Hacker News",
          published: h.created_at,
          publishedMs,
          summary: h.story_text
            ? h.story_text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280)
            : undefined,
          author: h.author,
          engagement: h.points,
          comments: h.num_comments,
          origin: "hn" as const,
        };
      });
  } catch {
    return [];
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Hacker News";
  }
}
