import type { Digest, DigestItem } from "../types/pov";

export function searchDigests(
  history: Digest[],
  latest: Digest | undefined,
  query: string,
): DigestItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  const results: DigestItem[] = [];

  const allDigests = latest ? [latest, ...history] : history;
  for (const digest of allDigests) {
    for (const item of digest.items) {
      if (seen.has(item.id)) continue;
      const haystack = [
        item.title,
        item.summary,
        item.whyItMatters,
        item.quotableSnippet,
        item.source,
        item.pillarName,
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) {
        seen.add(item.id);
        results.push(item);
      }
    }
  }
  return results.sort((a, b) => b.score - a.score);
}
