import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ActivityEntry } from "../storage/schema";
import { useAgentActivity } from "../newtab/hooks/useAgentActivity";
import { useTranslation } from "../i18n/useTranslation";
import {
  condenseIncomingToolEntry,
  elapsedSecondsSince,
  formatElapsedSeconds,
  isSubagentActivity,
  splitToolActivityText,
  stripSubagentPrefix,
  toolActivityUrls,
} from "../utils/agentActivity";

const ACTIVITY_STYLE: Record<
  ActivityEntry["kind"],
  { icon: typeof Brain; color: string }
> = {
  thinking: { icon: Brain, color: "text-violet-400" },
  assistant: { icon: Globe, color: "text-indigo-400" },
  tool_start: { icon: Wrench, color: "text-amber-400" },
  tool_done: { icon: Check, color: "text-emerald-500" },
  status: { icon: Check, color: "text-emerald-500" },
  error: { icon: AlertCircle, color: "text-rose-500" },
};

function looksLikeJson(text: string): boolean {
  // Strip a leading markdown code fence (``` or ```json) — the agent emits its
  // final digest as a fenced JSON block, which otherwise wouldn't start with {.
  const stripped = text.trim().replace(/^```[a-z]*\s*/i, "");
  if (stripped.startsWith("```")) return true;
  if (stripped.startsWith("{") || stripped.startsWith("[")) return true;
  // Two or more "key": pairs means it's a JSON object/fragment even when long
  // URL values dilute the punctuation-density heuristic below.
  const kvPairs = (stripped.match(/"[\w$-]+"\s*:/g) ?? []).length;
  if (kvPairs >= 2) return true;
  const jsonChars = (stripped.match(/[{}\[\]":,]/g) ?? []).length;
  return jsonChars / Math.max(stripped.length, 1) > 0.25;
}

export function condenseActivityFeed(
  log: ActivityEntry[],
  generatingLabel = "Generating digest…",
): ActivityEntry[] {
  const result: ActivityEntry[] = [];
  let thinkingBuf = "";
  let assistantBuf = "";
  let lastThinkingTs = 0;
  let lastAssistantTs = 0;
  let jsonDetected = false;

  function flushText(ts: number): void {
    if (thinkingBuf.trim().length > 10) {
      const trimmed = thinkingBuf.trim();
      result.push({
        ts: lastThinkingTs || ts,
        kind: "thinking",
        text: trimmed.slice(0, 300) + (trimmed.length > 300 ? "…" : ""),
      });
      thinkingBuf = "";
    }
    if (assistantBuf.trim().length > 3) {
      const trimmed = assistantBuf.trim();
      if (looksLikeJson(trimmed)) {
        if (!jsonDetected) {
          result.push({
            ts: lastAssistantTs || ts,
            kind: "status",
            text: generatingLabel,
          });
          jsonDetected = true;
        }
      } else {
        result.push({
          ts: lastAssistantTs || ts,
          kind: "assistant",
          text: trimmed.slice(0, 300) + (trimmed.length > 300 ? "…" : ""),
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
      flushText(entry.ts);
      const toolResult = condenseIncomingToolEntry(result, entry);
      if (toolResult !== "push") continue;
      result.push(entry);
    }
  }
  flushText(Date.now());
  return result;
}

const COMMAND_PREVIEW_LEN = 140;

function CommandDetail({ command }: { command: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = command.length > COMMAND_PREVIEW_LEN || command.includes("\n");
  const shown =
    expanded || !isLong ? command : `${command.slice(0, COMMAND_PREVIEW_LEN).trim()}…`;

  return (
    <div className="mt-1 ml-5">
      <pre className="text-[11px] font-mono text-stone-600 dark:text-stone-400 whitespace-pre-wrap break-all leading-relaxed">
        {shown}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[11px] font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
        >
          {expanded ? t("activity.showLess") : t("activity.showFullCommand")}
        </button>
      )}
    </div>
  );
}

export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const style = ACTIVITY_STYLE[entry.kind];
  const Icon = style.icon;
  const urls = toolActivityUrls(entry.text);
  const isSubagent = isSubagentActivity(entry.text);
  const cleanText = isSubagent ? stripSubagentPrefix(entry.text) : entry.text;

  if (entry.kind === "thinking") {
    return (
      <div className="px-4 py-2">
        <div className="flex items-start gap-2">
          <Brain className="w-3 h-3 mt-1 shrink-0 text-violet-400" />
          <p className="text-xs text-violet-600/80 dark:text-violet-400/80 italic leading-relaxed">
            {cleanText}
          </p>
        </div>
      </div>
    );
  }

  if (isSubagent && (entry.kind === "tool_start" || entry.kind === "tool_done")) {
    const isDone = entry.kind === "tool_done";
    return (
      <div
        className={`px-4 py-2.5 ${isDone ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "bg-amber-50/50 dark:bg-amber-900/10"}`}
      >
        <div className="flex items-center gap-2">
          {isDone ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
          )}
          <span
            className={`text-xs font-medium ${isDone ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
          >
            {cleanText}
          </span>
        </div>
      </div>
    );
  }

  if ((entry.kind === "tool_start" || entry.kind === "tool_done") && urls.length > 0) {
    const { label } = splitToolActivityText(entry.text);
    const firstUrl = urls[0]!;
    const isDone = entry.kind === "tool_done";
    return (
      <div className="px-4 py-1.5 flex items-center gap-2 text-xs">
        {isDone ? (
          <Check className="w-3 h-3 shrink-0 text-emerald-500" />
        ) : (
          <Loader2 className="w-3 h-3 shrink-0 text-amber-500 animate-spin" />
        )}
        <span className="text-stone-500 dark:text-stone-400">{label}</span>
        <a
          href={firstUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-500 hover:underline truncate"
        >
          {firstUrl.replace(/^https?:\/\//, "")}
        </a>
      </div>
    );
  }

  if (entry.kind === "tool_start" || entry.kind === "tool_done") {
    const { label, detail } = splitToolActivityText(entry.text);
    const isDone = entry.kind === "tool_done";
    const isCommand = /running command/i.test(label);

    if (detail && isCommand) {
      return (
        <div className="px-4 py-1.5">
          <div className="flex items-center gap-2 text-xs">
            {isDone ? (
              <Check className="w-3 h-3 shrink-0 text-emerald-500" />
            ) : (
              <Terminal className="w-3 h-3 shrink-0 text-amber-500" />
            )}
            <span className="text-stone-500 dark:text-stone-400">{label}</span>
          </div>
          <CommandDetail command={detail} />
        </div>
      );
    }

    if (detail) {
      return (
        <div className="px-4 py-1.5 flex items-center gap-2 text-xs min-w-0">
          {isDone ? (
            <Check className="w-3 h-3 shrink-0 text-emerald-500" />
          ) : (
            <Icon className={`w-3 h-3 shrink-0 ${style.color}`} />
          )}
          <span className="text-stone-500 dark:text-stone-400 shrink-0">{label}</span>
          <span className="text-stone-600 dark:text-stone-300 truncate">{detail}</span>
        </div>
      );
    }
  }

  if (entry.kind === "assistant" && entry.text.startsWith("Visited ")) {
    return (
      <div className="px-4 py-2 bg-indigo-50/30 dark:bg-indigo-900/10">
        <div className="flex items-start gap-2">
          <Globe className="w-3 h-3 mt-0.5 shrink-0 text-indigo-400" />
          <span className="text-xs text-indigo-600 dark:text-indigo-400">{entry.text}</span>
        </div>
      </div>
    );
  }

  if (entry.kind === "error") {
    return (
      <div className="px-4 py-2 bg-rose-50/50 dark:bg-rose-900/10">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-rose-400" />
          <span className="text-xs text-rose-600 dark:text-rose-400">{entry.text}</span>
        </div>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="px-4 py-2">
        <div className="flex items-start gap-2">
          <Globe className="w-3 h-3 mt-0.5 shrink-0 text-indigo-400" />
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed break-words">
            {entry.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1.5 flex items-center gap-2 text-xs">
      <Icon className={`w-3 h-3 shrink-0 ${style.color}`} />
      <span className="text-stone-500 dark:text-stone-400">
        {entry.text.replace(/ ✓$/, "")}
      </span>
    </div>
  );
}

type Props = {
  active: boolean;
  seed?: ActivityEntry[];
  title: string;
  generatingLabel?: string;
  elapsed?: number;
  startedAt?: string;
  streamingItemCount?: number;
  onStop?: () => void;
  onOpenDetails?: () => void;
  cancelling?: boolean;
  collapsible?: boolean;
  maxHeight?: string;
  className?: string;
  emptyMessage?: string;
};

export function AgentActivityFeed({
  active,
  seed = [],
  title,
  generatingLabel: generatingLabelProp,
  elapsed: elapsedProp,
  startedAt,
  streamingItemCount = 0,
  onStop,
  onOpenDetails,
  cancelling = false,
  collapsible = true,
  maxHeight = "max-h-64",
  className = "",
  emptyMessage: emptyMessageProp,
}: Props) {
  const { t } = useTranslation();
  const generatingLabel = generatingLabelProp ?? t("activity.generatingDigest");
  const emptyMessage = emptyMessageProp ?? t("activity.connecting");
  const [collapsed, setCollapsed] = useState(false);
  const [elapsedLocal, setElapsedLocal] = useState(() => elapsedSecondsSince(startedAt));
  const scrollRef = useRef<HTMLDivElement>(null);
  const fallbackStartRef = useRef<number>(Date.now());
  const pinnedToBottomRef = useRef(true);

  const log = useAgentActivity(active, seed);
  const condensed = condenseActivityFeed(log, generatingLabel);
  const doneCount = condensed.filter((e) => e.kind === "tool_done").length;
  const elapsed = elapsedProp ?? elapsedLocal;

  useEffect(() => {
    if (!active) {
      setElapsedLocal(0);
      return;
    }
    if (elapsedProp !== undefined) return;

    if (!startedAt) {
      fallbackStartRef.current = Date.now();
    }

    const tick = () => {
      setElapsedLocal(
        startedAt
          ? elapsedSecondsSince(startedAt)
          : Math.max(0, Math.round((Date.now() - fallbackStartRef.current) / 1000)),
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active, startedAt, elapsedProp]);

  // Only auto-scroll when the user is parked at the bottom; don't yank them
  // back down while they're scrolled up reading earlier activity.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !collapsed && pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [condensed, collapsed]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 40;
  }

  if (!active) return null;

  return (
    <div
      className={`rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-white dark:bg-stone-900 overflow-hidden shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-50/80 to-transparent dark:from-indigo-900/20 dark:to-transparent">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white dark:border-stone-900 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 block truncate">
            {title}
          </span>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-stone-400">
            <span className="tabular-nums">{formatElapsedSeconds(elapsed)}</span>
            {doneCount > 0 && (
              <span className="text-emerald-500 dark:text-emerald-400">
                {doneCount !== 1
                  ? t("activity.stepsDone", { count: doneCount })
                  : t("activity.stepDone", { count: doneCount })}
              </span>
            )}
            {streamingItemCount > 0 && (
              <span className="text-indigo-500 dark:text-indigo-400">
                {t("activity.newInFeed", { count: streamingItemCount })}
              </span>
            )}
          </div>
        </div>
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="px-2 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 font-medium text-xs transition-colors"
          >
            {t("activity.details")}
          </button>
        )}
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
            />
          </button>
        )}
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            disabled={cancelling}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              cancelling
                ? "bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-not-allowed"
                : "bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40"
            }`}
          >
            {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
            {cancelling ? t("activity.stopping") : t("activity.stop")}
          </button>
        )}
      </div>

      {(!collapsible || !collapsed) && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`${maxHeight} overflow-y-auto border-t border-stone-100 dark:border-stone-800 scroll-smooth divide-y divide-stone-50 dark:divide-stone-800/50`}
        >
          {condensed.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-stone-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {emptyMessage}
            </div>
          ) : (
            condensed.map((entry, i) => <ActivityRow key={`${entry.ts}-${i}`} entry={entry} />)
          )}
        </div>
      )}
    </div>
  );
}
