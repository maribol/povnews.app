import type {
  AgentRunState,
  Digest,
  DigestItem,
  ItemRating,
  ProfileDraft,
  RunHistoryEntry,
  UserPOV,
} from "../types/pov";
import { DEFAULT_POV } from "../types/defaultPov";
import type { FeedbackRecord } from "./feedback";

export const STORAGE_KEYS = {
  apiKey: "cursorApiKey",
  userPov: "userPOV",
  latestDigest: "latestDigest",
  digestHistory: "digestHistory",
  runState: "agentRunState",
  itemRatings: "itemRatings",
  theme: "theme",
  lastManualRefresh: "lastManualRefreshAt",
  onboardingComplete: "onboardingComplete",
  feedbackHistory: "feedbackHistory",
  archivedItemIds: "archivedItemIds",
  viewMode: "viewMode",
  pillarSuggestionDraft: "pillarSuggestionDraft",
  profileDraft: "profileDraft",
  tokenUsage: "tokenUsage",
  runHistory: "runHistory",
  disableRateLimit: "disableRateLimit",
  cloudModel: "cloudModel",
  customPrompts: "customPrompts",
  wizardState: "wizardState",
  agentActivity: "agentActivity",
  autoDiscoverSources: "autoDiscoverSources",
  seenUrls: "seenUrls",
  stats: "engagementStats",
  lastCandidates: "lastCandidates",
  readItemIds: "readItemIds",
} as const;

export type ThemePreference = "light" | "dark" | "system";
export type ViewMode = "list" | "compact" | "grid";

/** Rolling record of article URLs already surfaced, so we never repeat them. */
export type SeenUrl = { u: string; ts: number };

/** One day of engagement metrics for the dashboard sparklines. */
export type StatDay = {
  date: string;
  delivered: number;
  read: number;
  liked: number;
  disliked: number;
  archived: number;
  runs: number;
  candidates: number;
  sources: number;
};

export type StatsState = {
  days: StatDay[];
  perPillar: Record<string, number>;
  totalDelivered: number;
  totalRead: number;
  totalLiked: number;
  lastActiveDate?: string;
  streak: number;
};

/** Client-discovered candidate persisted between the discover and score phases. */
export type StoredCandidate = {
  url: string;
  title: string;
  source: string;
  published?: string;
  summary?: string;
  pillarSlug?: string;
  engagement?: number;
  origin: "rss" | "reddit" | "hn";
};

export type TokenDayRecord = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  runs: number;
};

export type CustomPrompts = {
  profileGenerator?: string;
  parent?: string;
  subagent?: string;
  brandVoice?: string;
  pillars?: string;
  povFraming?: string;
  scoringRubric?: string;
  sources?: string;
};

export type StoredSchema = {
  [STORAGE_KEYS.apiKey]?: string;
  [STORAGE_KEYS.userPov]?: UserPOV;
  [STORAGE_KEYS.latestDigest]?: Digest;
  [STORAGE_KEYS.digestHistory]?: Digest[];
  [STORAGE_KEYS.runState]?: AgentRunState;
  [STORAGE_KEYS.itemRatings]?: Record<string, ItemRating>;
  [STORAGE_KEYS.theme]?: ThemePreference;
  [STORAGE_KEYS.lastManualRefresh]?: string;
  [STORAGE_KEYS.onboardingComplete]?: boolean;
  [STORAGE_KEYS.feedbackHistory]?: FeedbackRecord[];
  [STORAGE_KEYS.archivedItemIds]?: string[];
  [STORAGE_KEYS.viewMode]?: ViewMode;
  [STORAGE_KEYS.pillarSuggestionDraft]?: UserPOV["pillars"];
  [STORAGE_KEYS.profileDraft]?: ProfileDraft;
  [STORAGE_KEYS.tokenUsage]?: TokenDayRecord[];
  [STORAGE_KEYS.runHistory]?: RunHistoryEntry[];
  [STORAGE_KEYS.disableRateLimit]?: boolean;
  [STORAGE_KEYS.cloudModel]?: string;
  [STORAGE_KEYS.customPrompts]?: CustomPrompts;
  [STORAGE_KEYS.wizardState]?: WizardPersistedState;
  [STORAGE_KEYS.autoDiscoverSources]?: boolean;
  [STORAGE_KEYS.seenUrls]?: SeenUrl[];
  [STORAGE_KEYS.stats]?: StatsState;
  [STORAGE_KEYS.lastCandidates]?: StoredCandidate[];
  [STORAGE_KEYS.readItemIds]?: string[];
};

export type ActivityEntry = {
  ts: number;
  kind: "thinking" | "assistant" | "tool_start" | "tool_done" | "status" | "error";
  text: string;
};

export type WizardPersistedState = {
  step: number;
  about: string;
  urls: string[];
};

const SCHEMA_VERSION = 2;

export async function getFromStorage<K extends keyof StoredSchema>(
  key: K,
): Promise<StoredSchema[K]> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StoredSchema[K];
}

export async function setInStorage<K extends keyof StoredSchema>(
  key: K,
  value: StoredSchema[K],
): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value, schemaVersion: SCHEMA_VERSION });
  } catch (err) {
    // A failed write (e.g. quota exceeded) used to be swallowed silently, which
    // looked like "history isn't being kept". Surface it so it's diagnosable.
    console.warn(`[news-for-you] storage write failed for "${String(key)}":`, err);
    throw err;
  }
}

/**
 * Serialize read-modify-write sequences per storage key. Concurrent
 * get→mutate→set on the same array (run history, digest history) would
 * otherwise clobber each other — one writer overwrites another's freshly
 * appended entry, losing history. Locks live for the service-worker lifetime;
 * that's the only window in which these writes race.
 */
const writeLocks = new Map<string, Promise<unknown>>();

export async function updateInStorage<K extends keyof StoredSchema>(
  key: K,
  updater: (current: StoredSchema[K]) => StoredSchema[K],
): Promise<void> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  const run = prev
    .catch(() => {})
    .then(async () => {
      const current = await getFromStorage(key);
      await setInStorage(key, updater(current));
    });
  writeLocks.set(key, run);
  try {
    await run;
  } finally {
    if (writeLocks.get(key) === run) writeLocks.delete(key);
  }
}

export async function ensureSeedData(): Promise<void> {
  const onboarding = await getFromStorage(STORAGE_KEYS.onboardingComplete);
  if (onboarding === undefined) {
    await setInStorage(STORAGE_KEYS.onboardingComplete, false);
  }

  await clearFixtureDigestIfNeeded();

  const pov = await getFromStorage(STORAGE_KEYS.userPov);
  if (!pov) {
    await setInStorage(STORAGE_KEYS.userPov, DEFAULT_POV);
  }

  const run = await getFromStorage(STORAGE_KEYS.runState);
  if (!run) {
    await setInStorage(STORAGE_KEYS.runState, { status: "idle" });
  }

  const theme = await getFromStorage(STORAGE_KEYS.theme);
  if (!theme) {
    await setInStorage(STORAGE_KEYS.theme, "system");
  }

  const viewMode = await getFromStorage(STORAGE_KEYS.viewMode);
  if (!viewMode) {
    await setInStorage(STORAGE_KEYS.viewMode, "list");
  }

  const archived = await getFromStorage(STORAGE_KEYS.archivedItemIds);
  if (!archived) {
    await setInStorage(STORAGE_KEYS.archivedItemIds, []);
  }

  const feedback = await getFromStorage(STORAGE_KEYS.feedbackHistory);
  if (!feedback) {
    await setInStorage(STORAGE_KEYS.feedbackHistory, []);
  }
}

export async function recordTokenUsage(
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const history = (await getFromStorage(STORAGE_KEYS.tokenUsage)) ?? [];
  const existing = history.find((r) => r.date === today);
  if (existing) {
    existing.inputTokens += inputTokens;
    existing.outputTokens += outputTokens;
    existing.totalTokens += inputTokens + outputTokens;
    existing.runs += 1;
  } else {
    history.push({
      date: today,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      runs: 1,
    });
  }
  await setInStorage(STORAGE_KEYS.tokenUsage, history.slice(-90));
}

/** How many runs / digests to retain. Generous because storage is unlimited. */
export const RUN_HISTORY_LIMIT = 200;
export const DIGEST_HISTORY_LIMIT = 120;

export async function upsertRunHistory(
  entry: Omit<RunHistoryEntry, "id"> & { id?: string; replaceId?: string },
): Promise<void> {
  const { replaceId, ...rest } = entry;
  await updateInStorage(STORAGE_KEYS.runHistory, (current) => {
    let history = current ?? [];
    if (replaceId) history = history.filter((h) => h.id !== replaceId);
    const id =
      rest.id ?? rest.finishedAt ?? rest.startedAt ?? `${Date.now()}-${rest.kind}`;
    const next: RunHistoryEntry = { ...rest, id };
    const idx = history.findIndex((h) => h.id === id);
    if (idx >= 0) {
      history = [...history];
      history[idx] = { ...history[idx], ...next };
    } else {
      history = [next, ...history];
    }
    return history.slice(0, RUN_HISTORY_LIMIT);
  });
}

/**
 * Insert or update a digest in history, keyed by runId. Streaming produces
 * many partial copies of the same run's digest; without dedup, history fills
 * with duplicates and balloons toward the quota.
 */
export async function upsertDigestHistory(digest: Digest): Promise<void> {
  await updateInStorage(STORAGE_KEYS.digestHistory, (current) => {
    const history = current ?? [];
    const runId = digest.runId;
    const withoutDupe = runId
      ? history.filter((d) => d.runId !== runId)
      : history;
    return [digest, ...withoutDupe].slice(0, DIGEST_HISTORY_LIMIT);
  });
}

/**
 * Flip run-history entries stranded in "running"/"starting-" to a terminal
 * state. The MV3 service worker can be evicted mid-run, leaving a row that
 * never finalizes and shows a perpetual spinner. Called on startup/resume;
 * `activeId` is the run still genuinely in flight (left untouched).
 */
export async function reconcileStuckRuns(activeId?: string): Promise<void> {
  await updateInStorage(STORAGE_KEYS.runHistory, (current) => {
    const history = current ?? [];
    return history.map((h) =>
      h.status === "running" && h.id !== activeId
        ? {
            ...h,
            status: "failed" as const,
            error: h.error ?? "Run interrupted (browser or extension restarted).",
            finishedAt: h.finishedAt ?? new Date().toISOString(),
          }
        : h,
    );
  });
}

export function isFixtureDigest(digest?: Digest): boolean {
  return Boolean(digest?.runId?.startsWith("fixture"));
}

export async function clearFixtureDigestIfNeeded(): Promise<void> {
  const existing = await getFromStorage(STORAGE_KEYS.latestDigest);
  if (isFixtureDigest(existing)) {
    await chrome.storage.local.remove(STORAGE_KEYS.latestDigest);
  }
}

export function getCalibrationSamples(digest?: Digest): DigestItem[] {
  if (!digest?.items?.length || isFixtureDigest(digest)) return [];
  return [...digest.items].sort((a, b) => b.score - a.score).slice(0, 10);
}

// ── Seen URLs (dedupe across runs) ─────────────────────────────────────────

const MAX_SEEN_URLS = 1500;

export async function getSeenUrls(): Promise<SeenUrl[]> {
  return (await getFromStorage(STORAGE_KEYS.seenUrls)) ?? [];
}

export async function markUrlsSeen(normalizedUrls: string[]): Promise<void> {
  if (!normalizedUrls.length) return;
  const now = Date.now();
  const existing = await getSeenUrls();
  const map = new Map(existing.map((r) => [r.u, r.ts]));
  for (const u of normalizedUrls) map.set(u, now);
  const merged = [...map.entries()]
    .map(([u, ts]) => ({ u, ts }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_SEEN_URLS);
  await setInStorage(STORAGE_KEYS.seenUrls, merged);
}

// ── Engagement stats ───────────────────────────────────────────────────────

function emptyStatDay(date: string): StatDay {
  return {
    date,
    delivered: 0,
    read: 0,
    liked: 0,
    disliked: 0,
    archived: 0,
    runs: 0,
    candidates: 0,
    sources: 0,
  };
}

function emptyStats(): StatsState {
  return {
    days: [],
    perPillar: {},
    totalDelivered: 0,
    totalRead: 0,
    totalLiked: 0,
    streak: 0,
  };
}

export async function getStats(): Promise<StatsState> {
  return (await getFromStorage(STORAGE_KEYS.stats)) ?? emptyStats();
}

type StatDelta = Partial<Omit<StatDay, "date">>;

/** Add engagement counts to today's bucket and update totals + streak. */
export async function bumpStats(
  delta: StatDelta,
  perPillarAdds?: Record<string, number>,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const stats = await getStats();

  let day = stats.days.find((d) => d.date === today);
  if (!day) {
    day = emptyStatDay(today);
    stats.days.push(day);
    stats.days = stats.days.slice(-90);
  }

  for (const [key, raw] of Object.entries(delta)) {
    if (typeof raw !== "number") continue;
    if (key === "sources") {
      day.sources = Math.max(day.sources, raw);
    } else {
      (day as unknown as Record<string, number>)[key] += raw;
    }
  }

  if (perPillarAdds) {
    for (const [slug, n] of Object.entries(perPillarAdds)) {
      stats.perPillar[slug] = (stats.perPillar[slug] ?? 0) + n;
    }
  }

  stats.totalDelivered += delta.delivered ?? 0;
  stats.totalRead += delta.read ?? 0;
  stats.totalLiked += delta.liked ?? 0;

  const engaged = (delta.read ?? 0) + (delta.liked ?? 0) + (delta.delivered ?? 0) > 0;
  if (engaged && stats.lastActiveDate !== today) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    stats.streak = stats.lastActiveDate === yesterday ? stats.streak + 1 : 1;
    stats.lastActiveDate = today;
  }

  await setInStorage(STORAGE_KEYS.stats, stats);
}

/**
 * Mark an item as read/seen. Idempotent — only the first time an item is read
 * counts toward the read stat, so the "read all-time" number reflects distinct
 * items actually opened.
 */
export async function markItemRead(itemId: string): Promise<void> {
  const current = (await getFromStorage(STORAGE_KEYS.readItemIds)) ?? [];
  if (current.includes(itemId)) return;
  await updateInStorage(STORAGE_KEYS.readItemIds, (cur) => {
    const list = cur ?? [];
    return list.includes(itemId) ? list : [...list, itemId].slice(-5000);
  });
  await bumpStats({ read: 1 });
}
