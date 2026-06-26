import type { Digest, DigestItem, DigestPillarSummary } from "../types/pov";
import { extractJsonFromText } from "./jsonExtract";

function isDigestItem(value: unknown): value is DigestItem {
  if (!value || typeof value !== "object") return false;
  const item = value as DigestItem;
  return Boolean(item.id && item.url && item.title && item.pillarSlug);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

function itemKeys(item: DigestItem): string[] {
  return [item.id, normalizeUrl(item.url)];
}

function computePillars(items: DigestItem[]): DigestPillarSummary[] {
  const counts = new Map<string, DigestPillarSummary>();
  for (const item of items) {
    const existing = counts.get(item.pillarSlug);
    if (existing) {
      existing.itemCount += 1;
    } else {
      counts.set(item.pillarSlug, {
        slug: item.pillarSlug,
        name: item.pillarName,
        itemCount: 1,
      });
    }
  }
  return [...counts.values()];
}

/** Pull complete item objects from a partial digest JSON stream. */
export function extractPartialDigestItems(text: string): DigestItem[] {
  const full = extractJsonFromText(text);
  if (full) {
    try {
      const parsed = JSON.parse(full) as Digest;
      if (Array.isArray(parsed.items)) {
        return parsed.items.filter(isDigestItem);
      }
    } catch {
      /* fall through to brace scan */
    }
  }

  const itemsKey = text.indexOf('"items"');
  if (itemsKey === -1) return [];

  const slice = text.slice(itemsKey);
  const arrayStart = slice.indexOf("[");
  if (arrayStart === -1) return [];

  const body = slice.slice(arrayStart + 1);
  const found: DigestItem[] = [];
  let depth = 0;
  let objStart = -1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        const candidate = body.slice(objStart, i + 1);
        try {
          const parsed = JSON.parse(candidate) as unknown;
          if (isDigestItem(parsed)) found.push(parsed);
        } catch {
          /* incomplete object */
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  return found;
}

export function mergeStreamingDigest(
  existing: Digest | undefined,
  incoming: DigestItem[],
  runId?: string,
): { digest: Digest; added: number; addedItems: DigestItem[] } | null {
  if (incoming.length === 0) return null;

  const seen = new Set<string>();
  for (const item of existing?.items ?? []) {
    for (const key of itemKeys(item)) seen.add(key);
  }
  const toAdd = incoming.filter((item) => !itemKeys(item).some((key) => seen.has(key)));
  if (toAdd.length === 0) return null;

  const items = [...toAdd, ...(existing?.items ?? [])];
  const digest: Digest = {
    generatedAt: new Date().toISOString(),
    runId: runId ?? existing?.runId ?? `streaming-${Date.now()}`,
    items,
    pillars: computePillars(items),
  };

  return { digest, added: toAdd.length, addedItems: toAdd };
}
