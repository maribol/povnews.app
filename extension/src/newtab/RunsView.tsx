import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  CircleSlash,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import type { AgentRunState, Digest, RunHistoryEntry } from "../types/pov";
import type { ActivityEntry } from "../storage/schema";
import { STORAGE_KEYS } from "../storage/schema";
import { condenseActivityLog, formatElapsedSeconds } from "../utils/agentActivity";
import { useStorage } from "./hooks/useStorage";
import { AgentThreadPane } from "./AgentThreadPane";

type Props = {
  runState: AgentRunState | undefined;
  onStop: () => void;
};

const STATUS_META: Record<
  RunHistoryEntry["status"],
  { label: string; dot: string; text: string }
> = {
  running: { label: "Running", dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
  succeeded: { label: "Succeeded", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Failed", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  cancelled: { label: "Cancelled", dot: "bg-stone-400", text: "text-stone-500 dark:text-stone-400" },
};

function formatTimestamp(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function durationLabel(entry: RunHistoryEntry): string {
  if (entry.durationMs) return formatElapsedSeconds(Math.round(entry.durationMs / 1000));
  if (entry.startedAt && entry.finishedAt) {
    return formatElapsedSeconds(
      Math.max(0, Math.round((Date.parse(entry.finishedAt) - Date.parse(entry.startedAt)) / 1000)),
    );
  }
  return "—";
}

const ROW_STYLE: Record<ActivityEntry["kind"], { icon: typeof Brain; color: string }> = {
  thinking: { icon: Brain, color: "text-violet-400" },
  assistant: { icon: Globe, color: "text-indigo-400" },
  tool_start: { icon: Wrench, color: "text-amber-400" },
  tool_done: { icon: CheckCircle2, color: "text-emerald-500" },
  status: { icon: CheckCircle2, color: "text-emerald-500" },
  error: { icon: AlertCircle, color: "text-rose-500" },
};

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { icon: Icon, color } = ROW_STYLE[entry.kind];
  const italic = entry.kind === "thinking";
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-sm">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <span
        className={`leading-relaxed text-stone-600 dark:text-stone-300 break-words ${italic ? "italic opacity-90" : ""}`}
      >
        {entry.text}
      </span>
    </div>
  );
}

/** Self-contained details for a finished/historical run. */
function HistoricalRunDetail({
  entry,
  digest,
}: {
  entry: RunHistoryEntry;
  digest: Digest | undefined;
}) {
  const meta = STATUS_META[entry.status];
  const activity = useMemo(
    () => condenseActivityLog(entry.activityLog ?? []),
    [entry.activityLog],
  );
  const StatusIcon =
    entry.status === "succeeded"
      ? CheckCircle2
      : entry.status === "failed"
        ? XCircle
        : entry.status === "cancelled"
          ? CircleSlash
          : Loader2;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <header className="shrink-0 px-6 py-4 border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
            <StatusIcon className={`w-5 h-5 ${meta.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 capitalize">
              {entry.kind} run
            </h2>
            <p className={`text-sm mt-0.5 font-medium ${meta.text}`}>
              {meta.label}
              {entry.trigger ? (
                <span className="text-stone-500 dark:text-stone-400 font-normal">
                  {" "}
                  · {entry.trigger}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-stone-400">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {durationLabel(entry)}
              </span>
              <span>{formatTimestamp(entry.startedAt)}</span>
              {entry.itemCount !== undefined && entry.itemCount > 0 && (
                <span>{entry.itemCount} new this run</span>
              )}
              {entry.activitySummary && <span>{entry.activitySummary}</span>}
            </div>
          </div>
        </div>

        {entry.error && (
          <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2 font-mono whitespace-pre-wrap break-words">
            {entry.error}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2">
          Activity
        </p>
        {activity.length === 0 ? (
          <p className="text-sm text-stone-400 py-2">No activity was recorded for this run.</p>
        ) : (
          <div className="rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 px-4 py-3">
            {activity.map((e, i) => (
              <ActivityRow key={`${e.ts}-${i}`} entry={e} />
            ))}
          </div>
        )}

        {digest && digest.items.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mt-6 mb-2">
              Produced digest · {digest.items.length} item{digest.items.length === 1 ? "" : "s"}
            </p>
            <div className="space-y-1.5">
              {digest.items.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-stone-300 group-hover:text-indigo-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-stone-700 dark:text-stone-200 leading-snug">
                      {item.title}
                    </span>
                    {item.pillarName && (
                      <span className="block text-[11px] text-stone-400 mt-0.5">
                        {item.pillarName}
                        {item.score !== undefined ? ` · score ${item.score}` : ""}
                      </span>
                    )}
                  </span>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RunsView({ runState, onStop }: Props) {
  const [history] = useStorage(STORAGE_KEYS.runHistory);
  const [digestHistory] = useStorage(STORAGE_KEYS.digestHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveId =
    runState && runState.status !== "idle" ? runState.runId ?? "__live__" : undefined;

  // Merge the live run into the list: history already holds a row for it, but if
  // it hasn't been written yet (very start of a run) synthesize one so the user
  // sees it immediately.
  const runs = useMemo<RunHistoryEntry[]>(() => {
    const list = [...(history ?? [])];
    if (liveId && runState && !list.some((h) => h.id === liveId)) {
      list.unshift({
        id: liveId,
        kind: runState.kind ?? "digest",
        status: runState.status === "running" ? "running" : runState.status === "failed" ? "failed" : "succeeded",
        trigger: runState.trigger,
        startedAt: runState.startedAt,
        finishedAt: runState.finishedAt,
        itemCount: runState.itemCount,
      });
    }
    return list;
  }, [history, liveId, runState]);

  const effectiveSelectedId = selectedId ?? runs[0]?.id ?? null;
  const isLiveSelected = !!liveId && effectiveSelectedId === liveId;
  const selectedEntry = runs.find((r) => r.id === effectiveSelectedId);

  // Keep the selection valid as runs come and go.
  useEffect(() => {
    if (selectedId && !runs.some((r) => r.id === selectedId)) setSelectedId(null);
  }, [runs, selectedId]);

  const producedDigest = selectedEntry
    ? (digestHistory ?? []).find((d) => d.runId === selectedEntry.id)
    : undefined;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-72 shrink-0 border-r border-stone-200/80 dark:border-stone-800/80 flex flex-col min-h-0 bg-white dark:bg-stone-900">
        <div className="shrink-0 px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
            Runs
          </p>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center text-stone-400">
              <Bot className="w-7 h-7 opacity-40" />
              <p className="text-sm">No runs yet.</p>
              <p className="text-xs">Hit refresh to start a digest run.</p>
            </div>
          ) : (
            <ul className="py-1">
              {runs.map((run) => {
                const meta = STATUS_META[run.status];
                const active = run.id === effectiveSelectedId;
                const isLive = run.id === liveId && run.status === "running";
                return (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(run.id)}
                      className={`w-full text-left px-4 py-2.5 border-l-2 transition-colors ${
                        active
                          ? "border-indigo-500 bg-stone-50 dark:bg-stone-800/60"
                          : "border-transparent hover:bg-stone-50 dark:hover:bg-stone-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2 shrink-0">
                          {isLive && (
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                          )}
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
                        </span>
                        <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
                        <span className="ml-auto text-[11px] text-stone-400 tabular-nums">
                          {durationLabel(run)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                        <span className="capitalize">{run.kind}</span>
                        {run.trigger && <span>· {run.trigger}</span>}
                        {run.itemCount ? <span>· {run.itemCount} new</span> : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-stone-400">
                        {formatTimestamp(run.startedAt ?? run.finishedAt)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {isLiveSelected ? (
        <AgentThreadPane runState={runState} onStop={onStop} />
      ) : selectedEntry ? (
        <HistoricalRunDetail entry={selectedEntry} digest={producedDigest} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-stone-400 bg-white dark:bg-stone-900">
          <Bot className="w-8 h-8 opacity-40" />
          <p className="text-sm">Select a run to see its details.</p>
        </div>
      )}
    </div>
  );
}
