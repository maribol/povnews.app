import { fetchText } from "./http";
import { looksLikeFeedXml, parseFeed, type RawFeedItem } from "./rssParser";

const COMMON_FEED_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed/",
  "/blog/feed",
  "/feed/rss",
  "/rss/index.xml",
];

/** Find a feed URL advertised in an HTML page's <head>. */
function findFeedLinkInHtml(html: string, baseUrl: string): string | undefined {
  const head = html.slice(0, 120_000);
  for (const tag of head.matchAll(/<link\b[^>]*>/gi)) {
    const link = tag[0];
    if (
      !/type\s*=\s*["'](?:application\/rss\+xml|application\/atom\+xml|application\/feed\+json|text\/xml)["']/i.test(
        link,
      )
    ) {
      continue;
    }
    const href = link.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      /* skip malformed href */
    }
  }
  return undefined;
}

/**
 * Resolve an arbitrary source URL to feed items:
 *   1. If the URL already serves a feed, parse it.
 *   2. Otherwise treat the body as HTML and sniff a <link rel=alternate> feed.
 *   3. Otherwise try a short list of conventional feed paths.
 */
export async function fetchFeedItems(
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<{ items: RawFeedItem[]; feedUrl?: string }> {
  let firstBody: string | undefined;
  try {
    firstBody = await fetchText(sourceUrl, signal);
  } catch {
    firstBody = undefined;
  }

  if (firstBody && looksLikeFeedXml(firstBody)) {
    const items = parseFeed(firstBody);
    if (items.length) return { items, feedUrl: sourceUrl };
  }

  if (firstBody) {
    const linked = findFeedLinkInHtml(firstBody, sourceUrl);
    if (linked && linked !== sourceUrl) {
      try {
        const body = await fetchText(linked, signal);
        const items = parseFeed(body);
        if (items.length) return { items, feedUrl: linked };
      } catch {
        /* fall through to common paths */
      }
    }
  }

  try {
    const origin = new URL(sourceUrl).origin;
    for (const path of COMMON_FEED_PATHS) {
      const candidate = origin + path;
      if (candidate === sourceUrl) continue;
      try {
        const body = await fetchText(candidate, signal);
        if (!looksLikeFeedXml(body)) continue;
        const items = parseFeed(body);
        if (items.length) return { items, feedUrl: candidate };
      } catch {
        /* try next path */
      }
    }
  } catch {
    /* invalid source URL */
  }

  return { items: [] };
}
