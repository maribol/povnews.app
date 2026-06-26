const DEFAULT_TIMEOUT_MS = 8_000;

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.9, text/html;q=0.8, */*;q=0.5";

/** Fetch text with a hard timeout, cooperating with a parent abort signal. */
export async function fetchText(
  url: string,
  parentSignal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onParentAbort = () => ctrl.abort();
  parentSignal?.addEventListener("abort", onParentAbort);

  try {
    const res = await fetch(url, {
      headers: { Accept: FEED_ACCEPT },
      credentials: "omit",
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  parentSignal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const text = await fetchText(url, parentSignal, timeoutMs);
  return JSON.parse(text) as T;
}

/**
 * Run async tasks with bounded concurrency and an overall deadline.
 * Tasks that reject are swallowed (callers handle per-task errors).
 */
export async function runPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
  deadlineMs: number,
): Promise<R[]> {
  const results: R[] = [];
  const start = Date.now();
  let cursor = 0;

  async function runner(): Promise<void> {
    while (cursor < items.length) {
      if (Date.now() - start > deadlineMs) return;
      const index = cursor++;
      try {
        results.push(await worker(items[index]!, index));
      } catch {
        /* per-task failure handled by worker return shape */
      }
    }
  }

  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, runner);
  await Promise.all(lanes);
  return results;
}
