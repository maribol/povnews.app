import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Square } from "lucide-react";
import type { AgentRunState } from "../types/pov";
import {
  ActivityRow,
  condenseActivityFeed,
} from "../components/AgentActivityFeed";
import { formatElapsedSeconds, summarizeActivity } from "../utils/agentActivity";
import { useAgentActivity } from "./hooks/useAgentActivity";

type Props = {
  runState: AgentRunState | undefined;
  onStop: () => void;
};

export function AgentThreadPane({ runState, onStop }: Props) {
  const running = runState?.status === "running";
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const live = running || runState?.status === "failed";
  const log = useAgentActivity(live, runState?.activityLog ?? []);
  const condensed = condenseActivityFeed(log);

  useEffect(() => {
    if (!running || !runState?.startedAt) {
      if (runState?.startedAt && runState.finishedAt) {
        setElapsed(
          Math.max(
            0,
            Math.round(
              (Date.parse(runState.finishedAt) - Date.parse(runState.startedAt)) / 1000,
            ),
          ),
        );
      }
      return;
    }
    const start = Date.parse(runState.startedAt);
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running, runState?.startedAt, runState?.finishedAt]);

  // Auto-scroll to the newest entry only while the user is parked at the
  // bottom. If they've scrolled up to read, leave their position alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [condensed]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 40;
  }

  const doneCount = condensed.filter((e) => e.kind === "tool_done").length;
  const statusLabel =
    runState?.status === "running"
      ? "Running"
      : runState?.status === "succeeded"
        ? "Completed"
        : runState?.status === "failed"
          ? "Failed"
          : "Idle";

  async function handleStop() {
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <header className="shrink-0 px-6 py-4 border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              {running ? (
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              ) : (
                <Bot className="w-5 h-5 text-indigo-500" />
              )}
            </div>
            {running && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white dark:border-stone-900 animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Agent thread
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              {runState?.kind ?? "digest"} · {statusLabel}
              {runState?.trigger ? ` · ${runState.trigger}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-stone-400">
              <span className="tabular-nums">{formatElapsedSeconds(elapsed)}</span>
              {doneCount > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {doneCount} step{doneCount !== 1 ? "s" : ""} done
                </span>
              )}
              {(runState?.streamingItemCount ?? 0) > 0 && (
                <span className="text-indigo-600 dark:text-indigo-400">
                  {runState!.streamingItemCount} new in feed
                </span>
              )}
              {runState?.itemCount !== undefined && runState.itemCount > 0 && (
                <span>{runState.itemCount} new this run</span>
              )}
              <span>{summarizeActivity(log)}</span>
            </div>
          </div>
          {running && (
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={stopping}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
                stopping
                  ? "bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-not-allowed"
                  : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40"
              }`}
            >
              {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              {stopping ? "Stopping…" : "Stop run"}
            </button>
          )}
        </div>

        {runState?.error && (
          <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2 font-mono whitespace-pre-wrap break-words">
            {runState.error}
          </p>
        )}
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0">
        {condensed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center text-stone-400">
            {running ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <p className="text-sm">Waiting for agent activity…</p>
              </>
            ) : (
              <>
                <Bot className="w-8 h-8 opacity-40" />
                <p className="text-sm">No agent run in progress.</p>
                <p className="text-xs">Hit refresh to start a new digest run.</p>
              </>
            )}
          </div>
        ) : (
          condensed.map((entry, i) => <ActivityRow key={`${entry.ts}-${i}`} entry={entry} />)
        )}
      </div>
    </div>
  );
}
