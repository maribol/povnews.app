import type { ActivityEntry } from "../storage/schema";

/** Plain-text marker for subagent tool activity (avoids emoji rendering issues). */
export const SUBAGENT_PREFIX = "subagent: ";

const LEGACY_SUBAGENT_START = "🔀 ";
const LEGACY_SUBAGENT_DONE = "✅ ";

export function formatSubagentActivity(description: string): string {
  return `${SUBAGENT_PREFIX}${description}`;
}

export function isSubagentActivity(text: string): boolean {
  return (
    text.startsWith(SUBAGENT_PREFIX) ||
    text.startsWith(LEGACY_SUBAGENT_START) ||
    text.startsWith(LEGACY_SUBAGENT_DONE)
  );
}

/** Strip subagent marker without breaking astral-plane emoji (regex char classes can't). */
export function stripSubagentPrefix(text: string): string {
  if (text.startsWith(SUBAGENT_PREFIX)) return text.slice(SUBAGENT_PREFIX.length);
  if (text.startsWith(LEGACY_SUBAGENT_START)) return text.slice(LEGACY_SUBAGENT_START.length);
  if (text.startsWith(LEGACY_SUBAGENT_DONE)) return text.slice(LEGACY_SUBAGENT_DONE.length);
  return text;
}

const URL_RE = /https?:\/\/[^\s"',)]+/g;

export function toolActivityUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

function toolActivityLabel(text: string): string {
  return text.split(" → ")[0].replace(/ ✓$/, "").trim();
}

export function toolActivityDetail(text: string): string | undefined {
  const cleaned = text.replace(/ ✓$/, "").trim();
  const sep = cleaned.indexOf(" → ");
  if (sep === -1) return undefined;
  const detail = cleaned.slice(sep + 3).trim();
  return detail || undefined;
}

export function splitToolActivityText(text: string): { label: string; detail?: string } {
  const label = toolActivityLabel(text);
  const detail = toolActivityDetail(text);
  return detail ? { label, detail } : { label };
}

function isFetchTool(text: string): boolean {
  return /fetch/i.test(toolActivityLabel(text));
}

export function mergeToolDoneIntoStart(
  start: ActivityEntry,
  done: ActivityEntry,
): ActivityEntry {
  const detail =
    toolActivityDetail(start.text) ??
    toolActivityDetail(done.text) ??
    toolActivityUrls(start.text)[0] ??
    toolActivityUrls(done.text)[0];
  const label = toolActivityLabel(start.text) || toolActivityLabel(done.text) || "Tool";
  if (detail) {
    return { ...start, kind: "tool_done", ts: done.ts, text: `${label} → ${detail}` };
  }
  return { ...start, kind: "tool_done", ts: done.ts, text: `${label} ✓` };
}

/** Collapse duplicate tool rows (e.g. generic "Web Fetch" + "Fetching → url"). */
export function condenseIncomingToolEntry(
  result: ActivityEntry[],
  entry: ActivityEntry,
): "push" | "skip" | "merged" {
  if (entry.kind === "tool_start" && result.length > 0) {
    const prev = result[result.length - 1];
    if (
      prev.kind === "tool_start" &&
      !isSubagentActivity(prev.text) &&
      !isSubagentActivity(entry.text)
    ) {
      const prevUrls = toolActivityUrls(prev.text);
      const entryUrls = toolActivityUrls(entry.text);
      const prevDetail = toolActivityDetail(prev.text);
      const entryDetail = toolActivityDetail(entry.text);
      if ((prevUrls.length === 0 && entryUrls.length > 0) || (!prevDetail && entryDetail)) {
        result[result.length - 1] = entry;
        return "merged";
      }
      if ((prevUrls.length > 0 && entryUrls.length === 0) || (prevDetail && !entryDetail)) {
        return "skip";
      }
      if (
        prevUrls.length === 0 &&
        entryUrls.length === 0 &&
        isFetchTool(prev.text) &&
        isFetchTool(entry.text)
      ) {
        return "skip";
      }
    }
  }

  if (entry.kind === "tool_done" && result.length > 0) {
    const prev = result[result.length - 1];
    if (prev.kind === "tool_start" && !isSubagentActivity(prev.text)) {
      result[result.length - 1] = mergeToolDoneIntoStart(prev, entry);
      return "merged";
    }
  }

  return "push";
}

export function elapsedSecondsSince(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
}

export function formatElapsedSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function condenseActivityLog(log: ActivityEntry[]): ActivityEntry[] {
  const result: ActivityEntry[] = [];
  let thinkingBuf = "";
  let assistantBuf = "";
  let lastThinkingTs = 0;
  let lastAssistantTs = 0;
  let jsonDetected = false;

  function looksLikeJson(text: string): boolean {
    const s = text.trim().replace(/^```[a-z]*\s*/i, "");
    if (s.startsWith("```")) return true;
    if (s.startsWith("{") || s.startsWith("[")) return true;
    const kvPairs = (s.match(/"[\w$-]+"\s*:/g) ?? []).length;
    if (kvPairs >= 2) return true;
    const jsonChars = (s.match(/[{}\[\]":,]/g) ?? []).length;
    return jsonChars / Math.max(s.length, 1) > 0.25;
  }

  function flush(ts: number): void {
    if (thinkingBuf.trim().length > 10) {
      result.push({
        ts: lastThinkingTs || ts,
        kind: "thinking",
        text:
          thinkingBuf.trim().slice(0, 280) +
          (thinkingBuf.trim().length > 280 ? "…" : ""),
      });
      thinkingBuf = "";
    }
    if (assistantBuf.trim().length > 3) {
      const trimmed = assistantBuf.trim();
      if (looksLikeJson(trimmed)) {
        if (!jsonDetected) {
          result.push({ ts: lastAssistantTs || ts, kind: "status", text: "Generating digest…" });
          jsonDetected = true;
        }
      } else {
        result.push({
          ts: lastAssistantTs || ts,
          kind: "assistant",
          text: trimmed.slice(0, 280) + (trimmed.length > 280 ? "…" : ""),
        });
      }
      assistantBuf = "";
    }
  }

  for (const entry of log) {
    if (entry.kind === "thinking") {
      thinkingBuf += entry.text;
      lastThinkingTs = entry.ts;
    } else if (entry.kind === "assistant") {
      assistantBuf += entry.text;
      lastAssistantTs = entry.ts;
    } else {
      flush(entry.ts);
      const toolResult = condenseIncomingToolEntry(result, entry);
      if (toolResult !== "push") continue;
      result.push(entry);
    }
  }
  flush(Date.now());
  return result;
}

export function summarizeActivity(log: ActivityEntry[]): string {
  const condensed = condenseActivityLog(log);
  if (condensed.length === 0) return "No activity recorded for this run.";

  const tools = condensed.filter((e) => e.kind === "tool_done").length;
  const subagents = condensed.filter(
    (e) => e.kind === "tool_done" && isSubagentActivity(e.text),
  ).length;
  const errors = condensed.filter((e) => e.kind === "error").length;
  const parts: string[] = [];
  if (subagents > 0) parts.push(`${subagents} subagent${subagents === 1 ? "" : "s"} finished`);
  if (tools > 0) parts.push(`${tools} tool step${tools === 1 ? "" : "s"}`);
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : `${condensed.length} steps logged`;
}

export function friendlyAgentError(raw: string): string {
  const jsonMatch = raw.match(/\{[\s\S]*"message"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];

  if (raw.includes("validation_error")) return "Request validation failed";
  if (raw.includes("Rate limited")) return raw;
  if (raw.startsWith("Cursor API")) {
    const after = raw.replace(/^Cursor API \d+:\s*/, "");
    try {
      const parsed = JSON.parse(after) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      /* use raw */
    }
  }
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}
