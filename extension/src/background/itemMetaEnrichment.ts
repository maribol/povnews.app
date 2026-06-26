import type { DigestItem } from "../types/pov";
import { fetchArticleHtml } from "./articleFetcher";
import { defaultFaviconUrl, extractPageMeta } from "./pageMeta";
import { getFromStorage, setInStorage, STORAGE_KEYS } from "../storage/schema";

const ENRICH_DELAY_MS = 250;

let enrichQueue = new Set<string>();
let enrichRunning = false;

function needsMeta(item: DigestItem): boolean {
  return Boolean(item.url && (!item.imageUrl || !item.faviconUrl));
}

export async function patchDigestItemMeta(
  match: { id?: string; url?: string },
  meta: Partial<Pick<DigestItem, "imageUrl" | "faviconUrl">>,
): Promise<boolean> {
  const digest = await getFromStorage(STORAGE_KEYS.latestDigest);
  if (!digest?.items?.length) return false;

  const idx = digest.items.findIndex((item) =>
    match.id ? item.id === match.id : match.url ? item.url === match.url : false,
  );
  if (idx < 0) return false;

  const current = digest.items[idx]!;
  const next: DigestItem = {
    ...current,
    imageUrl: meta.imageUrl ?? current.imageUrl,
    faviconUrl: meta.faviconUrl ?? current.faviconUrl,
  };

  if (next.imageUrl === current.imageUrl && next.faviconUrl === current.faviconUrl) {
    return false;
  }

  const items = [...digest.items];
  items[idx] = next;
  await setInStorage(STORAGE_KEYS.latestDigest, { ...digest, items });
  return true;
}

export async function enrichItemMeta(
  item: DigestItem,
): Promise<Partial<Pick<DigestItem, "imageUrl" | "faviconUrl">>> {
  if (!item.url) return {};

  if (item.imageUrl && item.faviconUrl) {
    return { imageUrl: item.imageUrl, faviconUrl: item.faviconUrl };
  }

  try {
    const html = await fetchArticleHtml(item.url);
    const meta = extractPageMeta(html, item.url);
    return {
      imageUrl: item.imageUrl ?? meta.imageUrl,
      faviconUrl: item.faviconUrl ?? meta.faviconUrl ?? defaultFaviconUrl(item.url),
    };
  } catch {
    return {
      faviconUrl: item.faviconUrl ?? defaultFaviconUrl(item.url),
    };
  }
}

async function enrichOneItem(id: string): Promise<void> {
  const digest = await getFromStorage(STORAGE_KEYS.latestDigest);
  const item = digest?.items?.find((entry) => entry.id === id);
  if (!item || !needsMeta(item)) return;

  const meta = await enrichItemMeta(item);
  await patchDigestItemMeta({ id }, meta);
}

async function drainEnrichQueue(): Promise<void> {
  if (enrichRunning) return;
  enrichRunning = true;
  try {
    while (enrichQueue.size > 0) {
      const id = enrichQueue.values().next().value as string | undefined;
      if (!id) break;
      enrichQueue.delete(id);
      await enrichOneItem(id);
      if (enrichQueue.size > 0) {
        await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
      }
    }
  } finally {
    enrichRunning = false;
  }
}

export function scheduleEnrichItems(items: DigestItem[]): void {
  for (const item of items) {
    if (needsMeta(item)) enrichQueue.add(item.id);
  }
  void drainEnrichQueue();
}

export async function backfillDigestMeta(): Promise<void> {
  const digest = await getFromStorage(STORAGE_KEYS.latestDigest);
  if (!digest?.items?.length) return;
  scheduleEnrichItems(digest.items.filter(needsMeta));
}
