/**
 * Minimal, dependency-free RSS 2.0 / Atom / RDF parser.
 *
 * MV3 service workers have no `DOMParser`, so we scan the XML with regex.
 * This handles the ~99% case (titles, links, dates, summaries, authors)
 * across WordPress, Substack, Ghost, Medium, and most newsroom feeds.
 */

export type RawFeedItem = {
  title?: string;
  link?: string;
  published?: string;
  summary?: string;
  author?: string;
};

function unwrapCdata(s: string): string {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read the inner text of the first matching (possibly namespaced) tag. */
function tagText(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  const value = decodeEntities(unwrapCdata(m[1]).trim());
  return value || undefined;
}

/** Atom links carry the URL in an attribute; prefer rel="alternate". */
function atomLink(block: string): string | undefined {
  const tags = [...block.matchAll(/<link\b[^>]*\/?>/gi)].map((m) => m[0]);
  if (tags.length === 0) return undefined;
  const hrefOf = (tag: string) =>
    tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];

  const alternate = tags.find((t) => /rel\s*=\s*["']alternate["']/i.test(t));
  if (alternate) return hrefOf(alternate);
  const noRel = tags.find((t) => !/rel\s*=/i.test(t));
  if (noRel) return hrefOf(noRel);
  for (const t of tags) {
    const h = hrefOf(t);
    if (h) return h;
  }
  return undefined;
}

function atomAuthor(block: string): string | undefined {
  const m = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  return m ? decodeEntities(unwrapCdata(m[1]).trim()) || undefined : undefined;
}

export function parseFeed(xml: string): RawFeedItem[] {
  if (!xml) return [];

  const isAtom = /<entry[\s>]/i.test(xml) && /<feed[\s>]/i.test(xml);
  const blocks = isAtom
    ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)]
    : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];

  const items: RawFeedItem[] = [];
  for (const match of blocks) {
    const block = match[0];

    const rawTitle = tagText(block, "title");
    const link = isAtom
      ? atomLink(block)
      : tagText(block, "link") ?? atomLink(block);
    const published =
      tagText(block, "pubDate") ??
      tagText(block, "published") ??
      tagText(block, "updated") ??
      tagText(block, "dc:date") ??
      tagText(block, "date");
    const rawSummary =
      tagText(block, "content:encoded") ??
      tagText(block, "description") ??
      tagText(block, "summary") ??
      tagText(block, "content");
    const author =
      tagText(block, "dc:creator") ?? atomAuthor(block) ?? tagText(block, "author");

    const title = rawTitle ? stripHtml(rawTitle) : undefined;
    if (!title && !link) continue;

    items.push({
      title,
      link: link?.trim(),
      published,
      summary: rawSummary ? stripHtml(rawSummary).slice(0, 600) : undefined,
      author: author ? stripHtml(author).slice(0, 80) : undefined,
    });
  }
  return items;
}

/** Cheap check whether a response body is actually a feed (vs an HTML page). */
export function looksLikeFeedXml(text: string): boolean {
  const head = text.slice(0, 1200).toLowerCase();
  return (
    head.includes("<rss") ||
    head.includes("<feed") ||
    head.includes("<rdf:rdf") ||
    (head.includes("<?xml") && (head.includes("<channel") || head.includes("<entry")))
  );
}
