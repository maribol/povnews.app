import type { UserPOV } from "../../types/pov";
import type { CandidateArticle, DiscoveryResult, FeedKind, FeedSource } from "./feedTypes";
import { fetchFeedItems } from "./feedResolver";
import { fetchRedditCandidates, isRedditUrl, redditSearchUrl } from "./redditSource";
import { fetchHnCandidates } from "./hackerNews";
import { runPool } from "./http";
import { getSeenUrls } from "../../storage/schema";
import { domainOf, normalizeUrl } from "../../utils/url";

const REDDIT_RECENCY_DAYS = 21;
const MAX_SOURCES = 20;
const MAX_PER_SOURCE = 8;
const DEFAULT_MAX_CANDIDATES = 50;
const DEFAULT_TIME_BUDGET_MS = 22_000;
const CONCURRENCY = 6;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "your", "you", "from", "are",
  "not", "but", "how", "why", "what", "when", "who", "our", "their", "about",
  "into", "than", "then", "more", "less", "new", "news", "via", "vs", "etc",
  "a", "an", "of", "in", "on", "to", "is", "it", "or", "by", "as", "at", "be",
]);

function keywords(text: string): string[] {
  const matched = text.toLowerCase().match(/[a-z0-9][a-z0-9+\-]{2,}/g) ?? [];
  return [...new Set(matched)].filter((w) => !STOPWORDS.has(w));
}

function pillarQuery(name: string, description: string): string {
  const kw = keywords(`${name} ${description}`);
  return kw.slice(0, 3).join(" ");
}

function buildSources(pov: UserPOV): FeedSource[] {
  const sources: FeedSource[] = [];

  for (const s of pov.sources) {
    if (!s.url) continue;
    const kind: FeedKind = isRedditUrl(s.url) ? "reddit" : "rss";
    sources.push({
      url: s.url,
      kind,
      pillarSlug: s.pillarSlug,
      weight: s.weight ?? 1,
      label: kind === "reddit" ? redditLabel(s.url) : domainOf(s.url),
    });
  }

  const hasReddit = sources.some((s) => s.kind === "reddit");
  const pillars = pov.pillars.slice(0, 4);

  // No Reddit sources configured → seed pain-language search from top pillars.
  if (!hasReddit) {
    for (const p of pillars.slice(0, 2)) {
      const q = pillarQuery(p.name, p.description);
      if (!q) continue;
      sources.push({
        url: redditSearchUrl(q),
        kind: "reddit",
        pillarSlug: p.slug,
        weight: 0.6,
        label: `Reddit · ${p.name}`,
      });
    }
  }

  // Always add a little Hacker News coverage keyed off the user's pillars.
  for (const p of pillars.slice(0, 3)) {
    const q = pillarQuery(p.name, p.description);
    if (!q) continue;
    sources.push({
      url: `hn:${q}`,
      kind: "hn",
      pillarSlug: p.slug,
      weight: 0.55,
      label: `Hacker News · ${p.name}`,
    });
  }

  return sources.sort((a, b) => b.weight - a.weight).slice(0, MAX_SOURCES);
}

function redditLabel(url: string): string {
  const sub = url.match(/\/r\/([^/?]+)/i);
  if (sub) return `r/${sub[1]}`;
  const user = url.match(/\/(?:u|user)\/([^/?]+)/i);
  if (user) return `u/${user[1]}`;
  return "reddit";
}

async function fetchSource(
  src: FeedSource,
  signal?: AbortSignal,
): Promise<CandidateArticle[]> {
  let cands: CandidateArticle[] = [];

  if (src.kind === "reddit") {
    cands = await fetchRedditCandidates(src.url, signal);
  } else if (src.kind === "hn") {
    const q = src.url.startsWith("hn:") ? src.url.slice(3) : src.url;
    cands = await fetchHnCandidates(q, { signal });
  } else {
    const { items } = await fetchFeedItems(src.url, signal);
    cands = items
      .filter((i) => i.link && i.title)
      .map((i) => ({
        url: i.link!,
        title: i.title!,
        source: domainOf(i.link!),
        published: i.published,
        publishedMs: i.published ? Date.parse(i.published) || undefined : undefined,
        summary: i.summary,
        author: i.author,
        origin: "rss" as const,
      }));
  }

  for (const c of cands) {
    if (!c.pillarSlug && src.pillarSlug) c.pillarSlug = src.pillarSlug;
  }
  return cands.slice(0, MAX_PER_SOURCE);
}

function withinRecency(c: CandidateArticle, recencyDays: number): boolean {
  if (!c.publishedMs) return true; // undated feeds: keep, but ranked lower
  const ageDays = (Date.now() - c.publishedMs) / 86_400_000;
  const limit = c.origin === "reddit" ? Math.min(recencyDays, REDDIT_RECENCY_DAYS) : recencyDays;
  return ageDays <= limit + 2;
}

function guessPillar(
  c: CandidateArticle,
  pillarKw: { slug: string; kw: string[] }[],
): string | undefined {
  if (c.pillarSlug) return c.pillarSlug;
  const hay = `${c.title} ${c.summary ?? ""}`.toLowerCase();
  let best: string | undefined;
  let bestScore = 0;
  for (const p of pillarKw) {
    let s = 0;
    for (const k of p.kw) if (k.length > 3 && hay.includes(k)) s += 1;
    if (s > bestScore) {
      bestScore = s;
      best = p.slug;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function rankScore(c: CandidateArticle): number {
  let s = 0;
  if (c.publishedMs) {
    const ageDays = (Date.now() - c.publishedMs) / 86_400_000;
    s += Math.max(0, 30 - ageDays);
  } else {
    s += 4;
  }
  if (c.engagement) s += Math.min(20, Math.log10(c.engagement + 1) * 8);
  if (c.pillarSlug) s += 8;
  if (c.origin === "reddit" && c.quote) s += 4;
  return s;
}

function moreComplete(a: CandidateArticle, b: CandidateArticle): CandidateArticle {
  return (b.engagement ?? 0) > (a.engagement ?? 0) ||
    (!a.summary && !!b.summary)
    ? { ...a, ...b }
    : { ...b, ...a };
}

/**
 * Pull fresh, real article candidates from the user's sources entirely
 * client-side — no LLM, no hallucinated URLs. The cloud agent only scores
 * what this returns.
 */
export async function discoverCandidates(
  pov: UserPOV,
  opts: {
    excludeUrls?: Set<string>;
    signal?: AbortSignal;
    onSource?: (label: string, found: number, kind: FeedKind) => void;
    maxCandidates?: number;
    timeBudgetMs?: number;
  } = {},
): Promise<DiscoveryResult> {
  const recencyDays = pov.scoringRubric?.recencyDays ?? 30;
  const maxCandidates = opts.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const sources = buildSources(pov);
  const exclude = new Set(opts.excludeUrls ?? []);
  for (const r of await getSeenUrls()) exclude.add(r.u);

  const pillarKw = pov.pillars.map((p) => ({
    slug: p.slug,
    kw: keywords(`${p.name} ${p.description}`),
  }));

  let sourcesOk = 0;
  const errors: string[] = [];
  const collected: CandidateArticle[] = [];

  await runPool(
    sources,
    async (src) => {
      try {
        const found = await fetchSource(src, opts.signal);
        if (found.length) sourcesOk += 1;
        opts.onSource?.(src.label, found.length, src.kind);
        collected.push(...found);
      } catch (err) {
        errors.push(`${src.label}: ${err instanceof Error ? err.message : "failed"}`);
        opts.onSource?.(src.label, 0, src.kind);
      }
    },
    CONCURRENCY,
    opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS,
  );

  // Normalize, dedupe, exclude already-seen, apply recency.
  const byUrl = new Map<string, CandidateArticle>();
  for (const raw of collected) {
    if (!raw.url || !raw.title) continue;
    const norm = normalizeUrl(raw.url);
    if (exclude.has(norm)) continue;
    if (!withinRecency(raw, recencyDays)) continue;

    const c: CandidateArticle = { ...raw, pillarSlug: guessPillar(raw, pillarKw) };
    const existing = byUrl.get(norm);
    byUrl.set(norm, existing ? moreComplete(existing, c) : c);
  }

  const candidates = [...byUrl.values()]
    .sort((a, b) => rankScore(b) - rankScore(a))
    .slice(0, maxCandidates);

  return {
    candidates,
    sourcesScanned: sources.length,
    sourcesOk,
    errors,
  };
}
