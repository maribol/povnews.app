import {
  cancelRun,
  clearModelCache,
  createCloudAgent,
  deleteAgent,
  downloadArtifact,
  getAgent,
  getRun,
  listArtifacts,
  listModels,
  normalizeRunStatus,
  streamRun,
  validateApiKey,
} from "./cursorClient";
import type { StreamEvent } from "./cursorClient";
import { fetchArticleHtml } from "./articleFetcher";
import {
  backfillDigestMeta,
  patchDigestItemMeta,
  scheduleEnrichItems,
} from "./itemMetaEnrichment";
import { defaultFaviconUrl, extractPageMeta } from "./pageMeta";
import {
  buildParentPrompt,
  buildProfilePrompt,
  buildScoringPrompt,
  profileSubagentDefinitions,
  subagentDefinitions,
} from "./povRunner";
import { discoverCandidates } from "./feeds/discover";
import type { CandidateArticle, DiscoveryResult } from "./feeds/feedTypes";
import type { Digest, DigestItem, ProfileDraft, RunKind, UserPOV } from "../types/pov";
import { DEFAULT_POV } from "../types/defaultPov";
import { recordFeedback } from "../storage/feedback";
import {
  STORAGE_KEYS,
  ensureSeedData,
  getCalibrationSamples,
  clearFixtureDigestIfNeeded,
  isFixtureDigest,
  getFromStorage,
  recordTokenUsage,
  upsertRunHistory,
  upsertDigestHistory,
  reconcileStuckRuns,
  setInStorage,
  bumpStats,
  markUrlsSeen,
  markItemRead,
} from "../storage/schema";
import type { ActivityEntry, StoredCandidate } from "../storage/schema";
import { normalizeUrl } from "../utils/url";
import { extractJsonFromText } from "./jsonExtract";
import {
  extractPartialDigestItems,
  mergeStreamingDigest,
} from "./partialDigest";
import {
  condenseActivityLog,
  formatSubagentActivity,
  summarizeActivity,
} from "../utils/agentActivity";

const POLL_ALARM = "digest-poll";
const DAILY_ALARM = "digest-daily";
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
const STREAM_BUFFER_MAX = 50_000;

const MAX_ACTIVITY = 200;
let activityLog: ActivityEntry[] = [];
let streamAbort: AbortController | null = null;
let streamAssistantText = "";
let partialMergeTimer: ReturnType<typeof setTimeout> | null = null;
let activityPersistTimer: ReturnType<typeof setTimeout> | null = null;
let activeRunId: string | undefined;

function streamBufferTail(): string {
  return streamAssistantText.slice(-STREAM_BUFFER_MAX);
}

/** Compact snapshot for the live runState, written frequently during a run. */
function activitySnapshot(): ActivityEntry[] {
  return condenseActivityLog(activityLog).slice(-40);
}

/**
 * Fuller snapshot stored once on a run's history entry, so the run-details
 * page can show the whole thread rather than just the last 40 lines.
 */
function fullActivitySnapshot(): ActivityEntry[] {
  return condenseActivityLog(activityLog).slice(-MAX_ACTIVITY);
}

async function persistRunActivity(extra: Record<string, unknown> = {}): Promise<void> {
  const state = await getFromStorage(STORAGE_KEYS.runState);
  if (state?.status !== "running") return;
  const snapshot = activitySnapshot();
  const summary = summarizeActivity(activityLog);
  await setInStorage(STORAGE_KEYS.runState, {
    ...state,
    activityLog: snapshot,
    streamBuffer: streamBufferTail(),
    ...extra,
  });
  if (state.runId) {
    await upsertRunHistory({
      id: state.runId,
      kind: state.kind ?? "digest",
      status: "running",
      trigger: state.trigger,
      startedAt: state.startedAt,
      activityLog: snapshot,
      activitySummary: summary,
    });
  }
}

function schedulePersistRunActivity(extra: Record<string, unknown> = {}): void {
  if (activityPersistTimer) clearTimeout(activityPersistTimer);
  activityPersistTimer = setTimeout(() => {
    activityPersistTimer = null;
    void persistRunActivity(extra);
  }, 500);
}

function schedulePartialDigestMerge(): void {
  if (partialMergeTimer) clearTimeout(partialMergeTimer);
  partialMergeTimer = setTimeout(() => {
    partialMergeTimer = null;
    void mergePartialDigestFromStream();
  }, 1500);
}

async function mergePartialDigestFromStream(): Promise<void> {
  const state = await getFromStorage(STORAGE_KEYS.runState);
  if (state?.status !== "running" || state.kind !== "digest") return;

  const text = streamAssistantText || state.streamBuffer || "";
  if (!text) return;

  const partialItems = extractPartialDigestItems(text);
  if (partialItems.length === 0) return;

  const existing = await getFromStorage(STORAGE_KEYS.latestDigest);
  const baseExisting = isFixtureDigest(existing) ? undefined : existing;
  const merged = mergeStreamingDigest(baseExisting, partialItems, state.runId ?? activeRunId);
  if (!merged) return;

  await setInStorage(STORAGE_KEYS.latestDigest, merged.digest);
  scheduleEnrichItems(partialItems);
  await onItemsDelivered(merged.addedItems);
  pushActivity({
    ts: Date.now(),
    kind: "status",
    text: `Added ${merged.added} item${merged.added === 1 ? "" : "s"} to your feed`,
  });

  const prevCount = state.streamingItemCount ?? 0;
  await persistRunActivity({
    streamingItemCount: prevCount + merged.added,
    phase: "writing",
    itemsWritten: prevCount + merged.added,
  });
}

/** Called whenever new items land in the digest (streaming or final). */
async function onItemsDelivered(items: DigestItem[]): Promise<void> {
  if (!items.length) return;
  await markUrlsSeen(items.map((it) => normalizeUrl(it.url)));
  const perPillar: Record<string, number> = {};
  for (const it of items) {
    if (it.pillarSlug) perPillar[it.pillarSlug] = (perPillar[it.pillarSlug] ?? 0) + 1;
  }
  await bumpStats({ delivered: items.length }, perPillar);
}

function toStoredCandidate(c: CandidateArticle): StoredCandidate {
  return {
    url: c.url,
    title: c.title,
    source: c.source,
    published: c.published,
    summary: c.summary,
    pillarSlug: c.pillarSlug,
    engagement: c.engagement,
    origin: c.origin,
  };
}

/**
 * Phase 1 of a digest run: discover real candidates entirely client-side.
 * Persists candidates + stats and emits staged activity. Returns the
 * candidates so the caller can hand them to the cloud agent for scoring.
 */
async function runClientDiscovery(
  pov: UserPOV,
): Promise<{ candidates: CandidateArticle[]; sourcesScanned: number; sourcesOk: number }> {
  pushActivity({
    ts: Date.now(),
    kind: "status",
    text: "Scanning your sources for fresh articles…",
  });

  const excludeUrls = new Set<string>();
  const current = await getFromStorage(STORAGE_KEYS.latestDigest);
  if (current && !isFixtureDigest(current)) {
    for (const it of current.items) excludeUrls.add(normalizeUrl(it.url));
  }
  for (const ap of pov.antiPatterns ?? []) {
    const m = ap.match(/https?:\/\/[^\s)]+/);
    if (m) excludeUrls.add(normalizeUrl(m[0]));
  }

  let result: DiscoveryResult;
  try {
    result = await discoverCandidates(pov, {
      excludeUrls,
      onSource: (label, found) => {
        if (found > 0) {
          pushActivity({
            ts: Date.now(),
            kind: "tool_done",
            text: `${label} — ${found} article${found === 1 ? "" : "s"}`,
          });
        }
      },
    });
  } catch (err) {
    pushActivity({
      ts: Date.now(),
      kind: "error",
      text: `Discovery error: ${err instanceof Error ? err.message : String(err)}`,
    });
    result = { candidates: [], sourcesScanned: 0, sourcesOk: 0, errors: [] };
  }

  await setInStorage(STORAGE_KEYS.lastCandidates, result.candidates.map(toStoredCandidate));
  await bumpStats({
    runs: 1,
    sources: result.sourcesScanned,
    candidates: result.candidates.length,
  });

  pushActivity({
    ts: Date.now(),
    kind: "status",
    text: result.candidates.length
      ? `Found ${result.candidates.length} fresh article${result.candidates.length === 1 ? "" : "s"} across ${result.sourcesOk}/${result.sourcesScanned} sources`
      : `No fresh articles in your sources — handing off to web search`,
  });

  return {
    candidates: result.candidates,
    sourcesScanned: result.sourcesScanned,
    sourcesOk: result.sourcesOk,
  };
}

function pushActivity(entry: ActivityEntry): void {
  activityLog.push(entry);
  if (activityLog.length > MAX_ACTIVITY) {
    activityLog = activityLog.slice(-MAX_ACTIVITY);
  }
  schedulePersistRunActivity();
  void broadcastActivity(entry);
}

async function broadcastActivity(entry: ActivityEntry): Promise<void> {
  const msg = { type: "AGENT_ACTIVITY", entry, log: activityLog };
  for (const port of activePorts) {
    try { port.postMessage(msg); } catch { /* port disconnected */ }
  }
}

const activePorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "agent-activity") {
    activePorts.add(port);
    port.postMessage({ type: "AGENT_ACTIVITY_SNAPSHOT", log: activityLog });
    port.onDisconnect.addListener(() => activePorts.delete(port));
  }
});

const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading file",
  edit_file: "Editing file",
  write_file: "Writing file",
  run_terminal_cmd: "Running command",
  mcp: "Using tool",
  browser_navigate: "Opening page",
  browser_snapshot: "Inspecting page",
  browser_click: "Clicking",
  browser_type: "Typing",
  web_search: "Searching web",
  search: "Searching",
  fetch: "Fetching page",
  task: "Delegating to subagent",
};

function humanToolName(raw: string): string | null {
  if (!raw || raw === "heartbeat") return null;
  return TOOL_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTerminalCommand(args: Record<string, unknown>): string | undefined {
  const read = (obj: Record<string, unknown>): string | undefined => {
    const cmd = obj.command ?? obj.cmd;
    return typeof cmd === "string" && cmd.trim() ? cmd.trim() : undefined;
  };

  const direct = read(args);
  if (direct) return direct;

  for (const value of Object.values(args)) {
    if (!value || typeof value !== "object") continue;
    const nested = value as Record<string, unknown>;
    const inner = (nested.args ?? nested) as Record<string, unknown>;
    if (inner && typeof inner === "object") {
      const cmd = read(inner);
      if (cmd) return cmd;
    }
  }
  return undefined;
}

function toolCallDetail(name: string, args: Record<string, unknown>): string | undefined {
  if (name === "run_terminal_cmd") {
    return extractTerminalCommand(args);
  }
  const argsStr = JSON.stringify(args);
  const urlMatch = argsStr.match(/https?:\/\/[^\s"',}]+/);
  if (urlMatch) return urlMatch[0];
  if (typeof args.path === "string" && args.path.trim()) return args.path.trim();
  if (typeof args.query === "string" && args.query.trim()) return args.query.trim();
  return undefined;
}

function formatToolCallActivity(name: string, isStart: boolean, args?: unknown): string | null {
  const toolName = humanToolName(name);
  if (!toolName) return null;
  let text = toolName;
  if (isStart && args && typeof args === "object" && args !== null) {
    const detail = toolCallDetail(name, args as Record<string, unknown>);
    if (detail) text += ` → ${detail}`;
  }
  if (!isStart) text += " ✓";
  return text;
}

function webFetchUrlFromToolCall(tc: Record<string, unknown>): string | undefined {
  const wf = (tc.webFetchToolCall ?? tc.args) as Record<string, unknown> | undefined;
  const fetchArgs = (wf?.args ?? wf) as Record<string, unknown> | undefined;
  return fetchArgs?.url as string | undefined;
}

function isWebFetchToolCall(tc: Record<string, unknown>): boolean {
  return tc.type === "web_fetch" || "webFetchToolCall" in tc;
}

function isTerminalToolCall(tc: Record<string, unknown>): boolean {
  return tc.type === "run_terminal_cmd" || "runTerminalCommand" in tc;
}

function terminalCommandFromToolCall(tc: Record<string, unknown>): string | undefined {
  const args = tc.args as Record<string, unknown> | undefined;
  if (args) {
    const cmd = extractTerminalCommand(args);
    if (cmd) return cmd;
  }
  const nested = tc.runTerminalCommand as Record<string, unknown> | undefined;
  if (nested) {
    const inner = (nested.args ?? nested) as Record<string, unknown>;
    return extractTerminalCommand(inner);
  }
  return undefined;
}

function startStreaming(
  apiKey: string,
  agentId: string,
  runId: string,
  options?: { resume?: boolean; keepActivity?: boolean },
): void {
  stopStreaming();
  if (!options?.resume) {
    if (!options?.keepActivity) activityLog = [];
    streamAssistantText = "";
  }
  activeRunId = runId;
  streamAbort = new AbortController();
  const streamRunId = runId;

  streamRun(apiKey, agentId, runId, (event: StreamEvent) => {
    // Drop events from a stream that's been superseded (e.g. user stopped and
    // retried) — a stale stream firing late must not pollute the new run.
    if (streamRunId !== activeRunId) return;
    const ts = Date.now();
    switch (event.type) {
      case "thinking":
        pushActivity({ ts, kind: "thinking", text: event.text });
        break;
      case "assistant":
        streamAssistantText += event.text;
        pushActivity({ ts, kind: "assistant", text: event.text });
        schedulePartialDigestMerge();
        break;
      case "tool_call": {
        // Skip tools handled via interaction_update to avoid duplicate rows.
        if (event.name === "task" || event.name === "web_fetch") break;
        const isStart = event.status === "running";
        const text = formatToolCallActivity(event.name, isStart, event.args);
        if (!text) break;
        pushActivity({ ts, kind: isStart ? "tool_start" : "tool_done", text });
        break;
      }
      case "interaction_update": {
        const d = event.data;
        const sub = event.subtype;
        if (sub === "tool-call-started") {
          const tc = d.toolCall as Record<string, unknown> | undefined;
          if (tc) {
            const toolType = tc.type as string;
            if (toolType === "task") {
              const args = tc.args as Record<string, unknown> | undefined;
              if (args?.description) {
                pushActivity({
                  ts,
                  kind: "tool_start",
                  text: formatSubagentActivity(String(args.description)),
                });
              }
            } else if (isWebFetchToolCall(tc)) {
              const url = webFetchUrlFromToolCall(tc);
              if (url) pushActivity({ ts, kind: "tool_start", text: `Fetching → ${url}` });
            } else if (isTerminalToolCall(tc)) {
              const command = terminalCommandFromToolCall(tc);
              if (command) pushActivity({ ts, kind: "tool_start", text: `Running command → ${command}` });
            }
          }
        } else if (sub === "tool-call-completed") {
          const tc = d.toolCall as Record<string, unknown> | undefined;
          if (tc) {
            const toolType = tc.type as string;
            if (toolType === "task") {
              const args = tc.args as Record<string, unknown> | undefined;
              const result = tc.result as Record<string, unknown> | undefined;
              const label = (args?.description as string) ?? "Subagent";
              const dur = result?.value as Record<string, unknown> | undefined;
              const durMs = (dur?.durationMs ?? (result?.success as Record<string, unknown>)?.durationMs) as number | undefined;
              const durStr = durMs ? ` (${Math.round(durMs / 1000)}s)` : "";
              pushActivity({
                ts,
                kind: "tool_done",
                text: formatSubagentActivity(`${label}${durStr}`),
              });

              const conv = ((result?.value ?? result?.success) as Record<string, unknown>)?.conversationSteps as unknown[];
              if (Array.isArray(conv)) {
                const urls: string[] = [];
                for (const step of conv) {
                  const s = step as Record<string, unknown>;
                  const wf = s.toolCall as Record<string, unknown> | undefined;
                  const inner = wf?.webFetchToolCall as Record<string, unknown> | undefined;
                  const fetchResult = inner?.result as Record<string, unknown> | undefined;
                  const fetchUrl = ((fetchResult?.success ?? fetchResult) as Record<string, unknown>)?.url as string | undefined;
                  if (fetchUrl) urls.push(fetchUrl);
                }
                if (urls.length > 0) {
                  pushActivity({ ts, kind: "assistant", text: `Visited ${urls.length} pages: ${urls.slice(0, 5).map(u => u.replace(/^https?:\/\//, "")).join(", ")}${urls.length > 5 ? ` +${urls.length - 5} more` : ""}` });
                }
              }
            } else if (isWebFetchToolCall(tc)) {
              const url = webFetchUrlFromToolCall(tc);
              if (url) pushActivity({ ts, kind: "tool_done", text: `Fetching → ${url}` });
            }
          }
        }
        // skip thinking-delta, text-delta, token-delta (handled by thinking/assistant events)
        break;
      }
      case "status":
        break;
      case "error":
        // The live SSE stream is best-effort. Transport errors (HTTP 409, a
        // dropped reconnect, "run stream is no longer available") do NOT mean
        // the run failed — the run keeps going and its real terminal status
        // comes from polling. Surfacing these as red errors made a healthy run
        // look broken, so recover by polling instead of showing the error.
        void pollActiveRun();
        break;
      case "result":
        pushActivity({ ts, kind: "status", text: `Finished: ${event.status}` });
        break;
      case "done":
        break;
    }
  }, streamAbort.signal);
}

function stopStreaming(): void {
  if (partialMergeTimer) {
    clearTimeout(partialMergeTimer);
    partialMergeTimer = null;
  }
  if (streamAbort) {
    streamAbort.abort();
    streamAbort = null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureSeedData();
  void scheduleDailyAlarm();
  void resumeActiveRunIfNeeded();
  void backfillDigestMeta();
});

void ensureSeedData();
void scheduleDailyAlarm();
void resumeActiveRunIfNeeded();
void backfillDigestMeta();

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_ALARM) {
    void startDigestRun("scheduled");
  } else if (alarm.name === POLL_ALARM) {
    void pollActiveRun();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type as string;

  if (type === "REFRESH_NOW") {
    void handleManualRefresh().then(sendResponse);
    return true;
  }
  if (type === "START_INITIAL_DIGEST") {
    void startInitialDigest().then(sendResponse);
    return true;
  }
  if (type === "GET_RUN_STATE") {
    void getFromStorage(STORAGE_KEYS.runState).then(sendResponse);
    return true;
  }
  if (type === "VALIDATE_API_KEY") {
    void validateAndSaveApiKey(message.apiKey as string).then(sendResponse);
    return true;
  }
  if (type === "GENERATE_PROFILE") {
    void generateProfile(
      message.about as string,
      (message.urls as string[] | undefined) ?? [],
    ).then(sendResponse);
    return true;
  }
  if (type === "POLL_ACTIVE_RUN") {
    void pollActiveRun().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (type === "CANCEL_AGENT_RUN") {
    void cancelActiveRun().then(sendResponse);
    return true;
  }
  if (type === "GET_PROFILE_DRAFT") {
    void getFromStorage(STORAGE_KEYS.profileDraft).then(sendResponse);
    return true;
  }
  if (type === "GET_CALIBRATION_SAMPLES") {
    void getFromStorage(STORAGE_KEYS.latestDigest).then((d) => {
      sendResponse({ items: getCalibrationSamples(d) });
    });
    return true;
  }
  if (type === "APPLY_FEEDBACK") {
    void applyFeedback(message.item).then(sendResponse);
    return true;
  }
  if (type === "ARCHIVE_ITEM") {
    void archiveItem(message.itemId as string).then(sendResponse);
    return true;
  }
  if (type === "UNARCHIVE_ITEM") {
    void unarchiveItem(message.itemId as string).then(sendResponse);
    return true;
  }
  if (type === "GET_ACTIVITY_LOG") {
    sendResponse({ log: activityLog });
    return true;
  }
  if (type === "FETCH_ARTICLE") {
    void fetchArticle(message.url as string).then(sendResponse);
    return true;
  }
  if (type === "MARK_READ") {
    void markItemRead(message.itemId as string).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (type === "LIST_MODELS") {
    void listAvailableModels(message.apiKey as string | undefined).then(sendResponse);
    return true;
  }
  return false;
});

async function listAvailableModels(
  apiKeyOverride?: string,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const apiKey = apiKeyOverride?.trim() || (await getFromStorage(STORAGE_KEYS.apiKey));
  if (!apiKey?.trim()) return { ok: false, error: "Add your Cursor API key first." };
  try {
    const models = await listModels(apiKey.trim());
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function validateAndSaveApiKey(
  apiKey: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return { ok: false, error: "API key is required" };
  }
  const result = await validateApiKey(trimmed);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Invalid API key" };
  }
  await setInStorage(STORAGE_KEYS.apiKey, trimmed);
  clearModelCache();
  return { ok: true, email: result.email };
}

async function scheduleDailyAlarm(): Promise<void> {
  const next = new Date();
  next.setHours(7, 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  await chrome.alarms.create(DAILY_ALARM, {
    when: next.getTime(),
    periodInMinutes: 24 * 60,
  });
}

async function handleManualRefresh(): Promise<{ ok: boolean; error?: string }> {
  const skipLimit = await getFromStorage(STORAGE_KEYS.disableRateLimit);
  if (!skipLimit) {
    const last = await getFromStorage(STORAGE_KEYS.lastManualRefresh);
    if (last) {
      const elapsed = Date.now() - new Date(last).getTime();
      if (elapsed < MANUAL_COOLDOWN_MS) {
        const mins = Math.ceil((MANUAL_COOLDOWN_MS - elapsed) / 60000);
        return { ok: false, error: `Rate limited. Try again in ${mins} min.` };
      }
    }
  }
  await setInStorage(STORAGE_KEYS.lastManualRefresh, new Date().toISOString());
  await startDigestRun("manual");
  return { ok: true };
}

async function startDigestRun(trigger: "scheduled" | "manual"): Promise<void> {
  return startAgentRun("digest", trigger);
}

async function startInitialDigest(): Promise<{ ok: boolean; error?: string }> {
  const runState = await getFromStorage(STORAGE_KEYS.runState);
  if (runState?.status === "running") {
    if (runState.kind === "digest") return { ok: true };
    return { ok: false, error: "Wait for profile generation to finish first." };
  }

  const existing = await getFromStorage(STORAGE_KEYS.latestDigest);
  if (existing?.items?.length && !isFixtureDigest(existing)) {
    return { ok: true };
  }

  await clearFixtureDigestIfNeeded();
  await startDigestRun("manual");
  return { ok: true };
}

async function generateProfile(
  about: string,
  urls: string[] = [],
): Promise<{ ok: boolean; pending?: boolean; draft?: ProfileDraft; error?: string }> {
  if (!about.trim()) {
    return { ok: false, error: "Tell us about yourself first" };
  }

  const apiKey = await getFromStorage(STORAGE_KEYS.apiKey);
  if (!apiKey?.trim()) {
    return { ok: false, error: "Add your Cursor API key first" };
  }

  const runState = await getFromStorage(STORAGE_KEYS.runState);
  if (runState?.status === "running") {
    return { ok: false, error: "Another agent run is in progress" };
  }

  const fallback = emptyProfileDraft(about);
  await setInStorage(STORAGE_KEYS.profileDraft, fallback);
  await setInStorage(STORAGE_KEYS.runState, { status: "idle", kind: "profile" });
  clearModelCache();

  await startAgentRun("profile", "manual", about, urls);

  const state = await getFromStorage(STORAGE_KEYS.runState);
  if (state?.kind === "profile" && state.status === "failed") {
    return { ok: false, error: state.error ?? "Failed to start profile agent" };
  }
  if (state?.kind === "profile" && state.status !== "running") {
    return {
      ok: false,
      error: "Profile agent did not start. Check your API key and try again.",
    };
  }

  return { ok: true, pending: true, draft: fallback };
}

async function startAgentRun(
  kind: RunKind,
  trigger: "scheduled" | "manual",
  aboutOverride?: string,
  urls?: string[],
): Promise<void> {
  const runState = await getFromStorage(STORAGE_KEYS.runState);
  if (runState?.status === "running") return;

  const apiKey = await getFromStorage(STORAGE_KEYS.apiKey);
  if (!apiKey?.trim()) {
    await setInStorage(STORAGE_KEYS.runState, {
      status: "failed",
      kind,
      error: "Add your Cursor API key in settings.",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  const pov = (await getFromStorage(STORAGE_KEYS.userPov)) ?? DEFAULT_POV;

  const startedAt = new Date().toISOString();
  const startingHistoryId = `starting-${startedAt}`;
  activityLog = [];
  streamAssistantText = "";

  // Persist running state immediately so the UI reflects the run right away
  // (digests then spend ~20s discovering before the cloud agent is created).
  await setInStorage(STORAGE_KEYS.runState, {
    status: "running",
    kind,
    trigger,
    startedAt,
    streamingItemCount: 0,
    activityLog: [],
    phase: kind === "digest" ? "discovering" : undefined,
  });
  await upsertRunHistory({
    id: startingHistoryId,
    kind,
    status: "running",
    trigger,
    startedAt,
  });

  let promptText: string;
  let subagents: ReturnType<typeof subagentDefinitions> | undefined;
  let discoveryMode: "client" | "agent" | undefined;
  let sourcesScanned: number | undefined;
  let candidatesFound: number | undefined;

  if (kind === "digest") {
    // Phase 1: real, client-side discovery (no LLM, no hallucinated URLs).
    const disco = await runClientDiscovery(pov);
    sourcesScanned = disco.sourcesScanned;
    candidatesFound = disco.candidates.length;

    if (disco.candidates.length > 0) {
      // Phase 2: cloud agent only scores + writes the real candidates.
      promptText = buildScoringPrompt(pov, disco.candidates);
      subagents = undefined;
      discoveryMode = "client";
    } else {
      // Fallback: no sources produced anything → let the agent search the web.
      promptText = buildParentPrompt(pov);
      subagents = subagentDefinitions(pov);
      discoveryMode = "agent";
    }

    const running = await getFromStorage(STORAGE_KEYS.runState);
    if (running?.status === "running") {
      await setInStorage(STORAGE_KEYS.runState, {
        ...running,
        phase: "scoring",
        discoveryMode,
        sourcesScanned,
        candidatesFound,
        activityLog: activitySnapshot(),
      });
    }
  } else if (kind === "profile") {
    const aboutText = aboutOverride ?? pov.about;
    promptText = buildProfilePrompt(aboutText, urls);
    subagents = profileSubagentDefinitions(aboutText, urls);
  } else {
    promptText = buildParentPrompt(pov);
  }

  try {
    const selectedModel = await getFromStorage(STORAGE_KEYS.cloudModel);
    const { agentId, runId } = await createCloudAgent(apiKey, {
      promptText,
      subagents,
      modelId: selectedModel?.trim() || undefined,
    });

    await setInStorage(STORAGE_KEYS.runState, {
      status: "running",
      kind,
      trigger,
      agentId,
      runId,
      startedAt,
      streamingItemCount: 0,
      activityLog: activitySnapshot(),
      phase: kind === "digest" ? "scoring" : undefined,
      discoveryMode,
      sourcesScanned,
      candidatesFound,
    });

    await upsertRunHistory({
      id: runId,
      replaceId: startingHistoryId,
      kind,
      status: "running",
      trigger,
      startedAt,
    });

    await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
    startStreaming(apiKey, agentId, runId, { keepActivity: kind === "digest" });
    console.info(`[news-for-you] ${kind} run started`, agentId, runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date().toISOString();
    await setInStorage(STORAGE_KEYS.runState, {
      status: "failed",
      kind,
      trigger,
      startedAt,
      error: message,
      finishedAt,
      activityLog: activitySnapshot(),
    });
    await upsertRunHistory({
      id: `${finishedAt}-${kind}`,
      replaceId: startingHistoryId,
      kind,
      status: "failed",
      trigger,
      startedAt,
      finishedAt,
      error: message,
      activityLog: fullActivitySnapshot(),
      activitySummary: summarizeActivity(activityLog),
    });
  }
}

function emptyProfileDraft(about: string): ProfileDraft {
  return {
    about: about.slice(0, 200).trim(),
    pillars: [],
    audiences: [],
    sources: [],
  };
}

async function cancelActiveRun(): Promise<{ ok: boolean; error?: string }> {
  const state = await getFromStorage(STORAGE_KEYS.runState);
  if (state?.status !== "running" || !state.agentId) {
    return { ok: false, error: "No active run to cancel" };
  }
  const apiKey = await getFromStorage(STORAGE_KEYS.apiKey);
  if (!apiKey) return { ok: false, error: "No API key" };

  stopStreaming();
  try {
    if (state.runId) {
      await cancelRun(apiKey, state.agentId, state.runId).catch(() => {});
    }
    await deleteAgent(apiKey, state.agentId).catch(() => {});
    await chrome.alarms.clear(POLL_ALARM);
    const finishedAt = new Date().toISOString();
    const durationMs = state.startedAt
      ? Date.parse(finishedAt) - Date.parse(state.startedAt)
      : undefined;
    await setInStorage(STORAGE_KEYS.runState, {
      status: "failed",
      kind: state.kind,
      agentId: state.agentId,
      runId: state.runId,
      startedAt: state.startedAt,
      finishedAt,
      error: "Cancelled by user",
      activityLog: activitySnapshot(),
    });
    await upsertRunHistory({
      id: state.runId ?? `${finishedAt}-${state.kind}`,
      kind: state.kind ?? "digest",
      status: "cancelled",
      trigger: state.trigger,
      startedAt: state.startedAt,
      finishedAt,
      durationMs,
      error: "Cancelled by user",
      activityLog: fullActivitySnapshot(),
      activitySummary: summarizeActivity(activityLog),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function resumeActiveRunIfNeeded(): Promise<void> {
  const state = await getFromStorage(STORAGE_KEYS.runState);

  // On every SW startup, finalize any run-history rows left "running" by an
  // eviction mid-run. The genuinely-active run (if any) is spared.
  const stillActive =
    state?.status === "running" && state.agentId && state.runId
      ? state.runId
      : undefined;
  await reconcileStuckRuns(stillActive);

  if (state?.status !== "running" || !state.agentId || !state.runId) return;

  const apiKey = await getFromStorage(STORAGE_KEYS.apiKey);
  if (!apiKey?.trim()) return;

  activityLog = state.activityLog ?? [];
  streamAssistantText = state.streamBuffer ?? "";
  activeRunId = state.runId;

  const alarms = await chrome.alarms.getAll();
  if (!alarms.some((a) => a.name === POLL_ALARM)) {
    await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  }

  startStreaming(apiKey, state.agentId, state.runId, { resume: true });
  console.info("[news-for-you] Resumed active run", state.agentId, state.runId);
  void pollActiveRun();
}

async function pollActiveRun(): Promise<void> {
  const state = await getFromStorage(STORAGE_KEYS.runState);
  if (state?.status !== "running" || !state.agentId) return;

  const apiKey = await getFromStorage(STORAGE_KEYS.apiKey);
  if (!apiKey) return;

  const kind = state.kind ?? "digest";

  if (state.startedAt && Date.now() - Date.parse(state.startedAt) > RUN_TIMEOUT_MS) {
    stopStreaming();
    if (state.runId) {
      await cancelRun(apiKey, state.agentId, state.runId).catch(() => undefined);
    }
    await deleteAgent(apiKey, state.agentId).catch(() => undefined);
    await finishRun(
      apiKey,
      state.agentId,
      "failed",
      "Run timed out after 45 minutes",
      kind,
    );
    return;
  }

  try {
    let runStatus = "running";
    let runResult: string | undefined;
    let runDuration: number | undefined;

    if (state.runId) {
      const run = await getRun(apiKey, state.agentId, state.runId);
      runStatus = run.status;
      runResult = run.result as string | undefined;
      runDuration = run.durationMs as number | undefined;
    } else {
      const agent = await getAgent(apiKey, state.agentId);
      const latest = agent.latestRunId as string | undefined;
      if (latest) {
        const run = await getRun(apiKey, state.agentId, latest);
        runStatus = run.status;
        runResult = run.result as string | undefined;
        runDuration = run.durationMs as number | undefined;
      } else if (agent.status) {
        runStatus = normalizeRunStatus(String(agent.status));
      }
    }

    if (runStatus === "running") {
      if (kind === "digest") {
        await mergePartialDigestFromStream();
      }
      return;
    }

    if (runStatus === "error" || runStatus === "cancelled") {
      await finishRun(apiKey, state.agentId, "failed", "Agent run failed", kind, runResult, runDuration);
      return;
    }

    // --- Extract JSON: prefer stream text, fall back to artifacts ---
    let raw: string | undefined;
    const streamText = streamAssistantText || state.streamBuffer || "";

    // 1) Try extracting from accumulated SSE assistant text
    if (streamText) {
      raw = extractJsonFromText(streamText);
      if (raw) console.info("[news-for-you] Extracted JSON from stream text");
    }

    // 2) Try extracting from the run result field
    if (!raw && runResult) {
      raw = extractJsonFromText(runResult);
      if (raw) console.info("[news-for-you] Extracted JSON from run result");
    }

    // 3) Fall back to artifacts API (works when agent has a repo)
    let listedArtifactPaths: string[] | undefined;
    if (!raw) {
      try {
        const artifacts = await listArtifacts(apiKey, state.agentId);
        listedArtifactPaths = artifacts.map((a) => a.path);
        const artifactName = kind === "profile" ? "profile.json" : "digest.json";
        const CANDIDATE_PATHS = kind === "profile"
          ? ["profile.json", "/agent/profile.json", "agent/profile.json"]
          : ["digest.json", "/agent/digest.json", "agent/digest.json"];

        let artifactPath =
          artifacts.find((a) => CANDIDATE_PATHS.includes(a.path))?.path ??
          artifacts.find((a) => a.path.endsWith(artifactName))?.path;

        if (artifactPath) {
          try {
            raw = await downloadArtifact(apiKey, state.agentId, artifactPath);
          } catch { /* ignore */ }
        }

        if (!raw) {
          for (const a of artifacts) {
            if (a.path.endsWith(".json")) {
              try {
                raw = await downloadArtifact(apiKey, state.agentId, a.path);
                break;
              } catch { continue; }
            }
          }
        }

        if (!raw) {
          for (const candidate of CANDIDATE_PATHS) {
            try {
              raw = await downloadArtifact(apiKey, state.agentId, candidate);
              break;
            } catch { continue; }
          }
        }
      } catch {
        // artifacts API unavailable (no repo) — expected for profile runs
      }
    }

    if (runDuration) {
      const estimatedTokens = Math.ceil(runDuration / 10);
      await recordTokenUsage(
        Math.ceil(estimatedTokens * 0.75),
        Math.ceil(estimatedTokens * 0.25),
      );
    }

    if (!raw) {
      const artifactName = kind === "profile" ? "profile.json" : "digest.json";
      const artifactHint =
        listedArtifactPaths === undefined
          ? " Artifacts API unavailable."
          : listedArtifactPaths.length > 0
            ? ` Artifacts: ${listedArtifactPaths.join(", ")}.`
            : " No artifacts found.";
      await finishRun(
        apiKey,
        state.agentId,
        "failed",
        `Could not extract ${artifactName} from agent.${artifactHint} Result: ${runResult?.slice(0, 200) ?? "none"}`,
        kind,
        runResult,
        runDuration,
      );
      return;
    }

    if (kind === "profile") {
      const parsed = JSON.parse(raw) as ProfileDraft;
      if (parsed.pillars?.length) {
        await setInStorage(STORAGE_KEYS.profileDraft, parsed);
        const pov = (await getFromStorage(STORAGE_KEYS.userPov)) ?? DEFAULT_POV;
        await setInStorage(STORAGE_KEYS.userPov, {
          ...pov,
          about: parsed.about ?? pov.about,
          pillars: parsed.pillars,
          audiences: parsed.audiences ?? pov.audiences,
          sources: parsed.sources ?? pov.sources,
          readerPreferences: parsed.readerPreferences ?? pov.readerPreferences,
        });
      }
      await finishRun(
        apiKey,
        state.agentId,
        "succeeded",
        undefined,
        kind,
        runResult,
        runDuration,
      );
    } else {
      const parsed = JSON.parse(raw) as Digest;
      const existing = await getFromStorage(STORAGE_KEYS.latestDigest);
      const baseExisting = isFixtureDigest(existing) ? undefined : existing;
      const merged = mergeStreamingDigest(
        baseExisting,
        parsed.items ?? [],
        state.runId ?? activeRunId,
      );

      let addedCount = 0;
      if (merged) {
        await setInStorage(STORAGE_KEYS.latestDigest, merged.digest);
        await upsertDigestHistory(merged.digest);
        addedCount = merged.added;
        await onItemsDelivered(merged.addedItems);
      } else if (!baseExisting && parsed.items?.length) {
        const digest: Digest = {
          ...parsed,
          generatedAt: new Date().toISOString(),
          runId: state.runId ?? parsed.runId ?? `run-${Date.now()}`,
        };
        await setInStorage(STORAGE_KEYS.latestDigest, digest);
        await upsertDigestHistory(digest);
        addedCount = parsed.items.length;
        await onItemsDelivered(digest.items);
      }

      scheduleEnrichItems(parsed.items ?? []);

      await finishRun(
        apiKey,
        state.agentId,
        "succeeded",
        undefined,
        kind,
        runResult,
        runDuration,
        addedCount,
      );
    }
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (state.agentId) {
      await deleteAgent(apiKey, state.agentId).catch(() => undefined);
    }
    await finishRun(apiKey, state.agentId, "failed", message, kind);
  }
}

async function finishRun(
  apiKey: string,
  agentId: string,
  status: "failed" | "succeeded",
  error: string | undefined,
  kind: RunKind,
  resultText?: string,
  durationMs?: number,
  itemCount?: number,
): Promise<void> {
  stopStreaming();
  await deleteAgent(apiKey, agentId).catch(() => undefined);
  await chrome.alarms.clear(POLL_ALARM);
  const prev = await getFromStorage(STORAGE_KEYS.runState);
  const finishedAt = new Date().toISOString();
  const snapshot = activitySnapshot();
  await setInStorage(STORAGE_KEYS.runState, {
    status,
    kind,
    trigger: prev?.trigger,
    agentId,
    runId: prev?.runId,
    startedAt: prev?.startedAt,
    finishedAt,
    error: status === "failed" ? error : undefined,
    resultText,
    durationMs,
    itemCount,
    streamingItemCount: prev?.streamingItemCount,
    activityLog: snapshot,
    phase: status === "succeeded" && kind === "digest" ? "done" : prev?.phase,
    discoveryMode: prev?.discoveryMode,
    sourcesScanned: prev?.sourcesScanned,
    candidatesFound: prev?.candidatesFound,
    itemsWritten: prev?.itemsWritten ?? itemCount,
  });
  await upsertRunHistory({
    id: prev?.runId ?? `${finishedAt}-${kind}`,
    kind,
    status:
      status === "succeeded"
        ? "succeeded"
        : error === "Cancelled by user"
          ? "cancelled"
          : "failed",
    trigger: prev?.trigger,
    startedAt: prev?.startedAt,
    finishedAt,
    durationMs,
    error: status === "failed" ? error : undefined,
    itemCount,
    activityLog: fullActivitySnapshot(),
    activitySummary: summarizeActivity(activityLog),
  });
}

async function applyFeedback(
  item: import("../types/pov").DigestItem,
): Promise<{ ok: boolean }> {
  const ratings = (await getFromStorage(STORAGE_KEYS.itemRatings)) ?? {};
  const rating = ratings[item.id];
  if (!rating) return { ok: false };
  await recordFeedback(item, rating);
  return { ok: true };
}

async function archiveItem(itemId: string): Promise<{ ok: boolean }> {
  const archived = (await getFromStorage(STORAGE_KEYS.archivedItemIds)) ?? [];
  if (!archived.includes(itemId)) {
    await setInStorage(STORAGE_KEYS.archivedItemIds, [...archived, itemId]);
  }
  return { ok: true };
}

async function unarchiveItem(itemId: string): Promise<{ ok: boolean }> {
  const archived = (await getFromStorage(STORAGE_KEYS.archivedItemIds)) ?? [];
  await setInStorage(
    STORAGE_KEYS.archivedItemIds,
    archived.filter((id) => id !== itemId),
  );
  return { ok: true };
}

async function fetchArticle(
  url: string,
): Promise<{ ok: boolean; html?: string; error?: string }> {
  try {
    const html = await fetchArticleHtml(url);
    const digest = await getFromStorage(STORAGE_KEYS.latestDigest);
    const item = digest?.items?.find((entry) => entry.url === url);
    if (item) {
      const meta = extractPageMeta(html, url);
      await patchDigestItemMeta(
        { id: item.id },
        {
          imageUrl: item.imageUrl ?? meta.imageUrl,
          faviconUrl: item.faviconUrl ?? meta.faviconUrl ?? defaultFaviconUrl(url),
        },
      );
    }
    return { ok: true, html };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
