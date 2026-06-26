import { useEffect, useRef, useState } from "react";
import {
  Key,
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  FileText,
  BarChart3,
  Shield,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Save,
  Upload,
  Download,
  User,
  Cpu,
  Newspaper,
  Eye,
  ThumbsUp,
  Flame,
  Coins,
} from "lucide-react";
import {
  STORAGE_KEYS,
  ensureSeedData,
  getFromStorage,
  setInStorage,
  type CustomPrompts,
  type ThemePreference,
  type TokenDayRecord,
  type StatsState,
} from "../storage/schema";
import type { AgentRunState, Digest, RunHistoryEntry } from "../types/pov";
import { Sparkline } from "../design/components/Sparkline";
import { friendlyAgentError } from "../utils/agentActivity";
import { useAgentActivity } from "../newtab/hooks/useAgentActivity";
import {
  ActivityRow,
  AgentActivityFeed,
  condenseActivityFeed,
} from "../components/AgentActivityFeed";
import { Toast, type ToastPayload } from "../newtab/Toast";
import { DEFAULT_POV } from "../types/defaultPov";
import {
  DEFAULT_CLOUD_MODEL,
  PRICING_URL,
  cloudModelInfo,
  type CloudModelInfo,
} from "../types/cloudModels";
import {
  downloadProfileJson,
  parseProfileImportJson,
  userPovToProfileDraft,
} from "../utils/profileImportExport";

const rawPromptModules = import.meta.glob("../../prompts/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function readDefaultPrompt(relativePath: string): string {
  const suffix = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  const keys = Object.keys(rawPromptModules);
  const key = keys.find((k) => k.endsWith(suffix));
  if (key) return rawPromptModules[key];
  const loose = keys.find((k) => k.includes(relativePath));
  if (loose) return rawPromptModules[loose];
  if (keys.length > 0) {
    console.warn(`[Settings] readDefaultPrompt: no match for "${relativePath}" in keys:`, keys);
  }
  return "";
}

const PROMPT_FILES: { key: keyof CustomPrompts; label: string; file: string }[] = [
  { key: "profileGenerator", label: "Profile generator", file: "profile-generator.md" },
  { key: "parent", label: "Digest orchestrator", file: "parent.md" },
  { key: "subagent", label: "Subagent template", file: "subagent.md" },
  { key: "brandVoice", label: "Brand voice", file: "context/brand-voice.md" },
  { key: "pillars", label: "Pillars context", file: "context/pillars.md" },
  { key: "povFraming", label: "POV framing", file: "context/pov-framing.md" },
  { key: "scoringRubric", label: "Scoring rubric", file: "context/scoring-rubric.md" },
  { key: "sources", label: "Sources context", file: "context/sources.md" },
];

function applyTheme(pref: ThemePreference): void {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function IconCircle({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return <div className={`icon-circle ${color}`}>{children}</div>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Newspaper;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="settings-card p-3.5 flex flex-col gap-2">
      <div className={`icon-circle ${tone} w-8 h-8`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-100 leading-none">
          {value}
        </p>
        <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">{label}</p>
      </div>
    </div>
  );
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Overview({
  stats,
  tokenData,
  digestHistory,
  runHistory,
}: {
  stats: StatsState | undefined;
  tokenData: TokenDayRecord[];
  digestHistory: Digest[];
  runHistory: RunHistoryEntry[];
}) {
  const days = stats?.days ?? [];
  const deliveredSeries = days.slice(-14).map((d) => d.delivered);
  const hasTrend = deliveredSeries.some((v) => v > 0);
  const totalTokens = tokenData.reduce((a, b) => a + b.totalTokens, 0);
  const recentDigests = digestHistory.slice(0, 5);
  const lastRun = runHistory.find((r) => r.finishedAt) ?? runHistory[0];

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2 px-1">
        Overview
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard
          icon={Newspaper}
          label="Delivered"
          value={stats?.totalDelivered ?? 0}
          tone="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          icon={Eye}
          label="Read"
          value={stats?.totalRead ?? 0}
          tone="bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
        />
        <StatCard
          icon={ThumbsUp}
          label="Liked"
          value={stats?.totalLiked ?? 0}
          tone="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={Flame}
          label="Day streak"
          value={stats?.streak ? `${stats.streak}d` : "0d"}
          tone="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 mt-2.5">
        {/* Activity */}
        <div className="settings-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Activity
            </p>
            <span className="text-[11px] text-stone-400">last 14 days</span>
          </div>
          {hasTrend ? (
            <Sparkline
              data={deliveredSeries}
              width={260}
              height={48}
              className="w-full h-12"
              ariaLabel="Items delivered over the last 14 days"
            />
          ) : (
            <p className="text-xs text-stone-400 py-3">
              No activity yet — your first digest will show up here.
            </p>
          )}
          {lastRun && (
            <p className="text-[11px] text-stone-400 mt-2">
              Last run {formatShortDate(lastRun.finishedAt ?? lastRun.startedAt)} ·{" "}
              {lastRun.status}
            </p>
          )}
        </div>

        {/* Cost & tokens */}
        <div className="settings-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <IconCircle color="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
              <Coins className="w-4 h-4" />
            </IconCircle>
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Token usage
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100 leading-none">
            {totalTokens.toLocaleString()}
          </p>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
            tokens across {tokenData.length} day{tokenData.length === 1 ? "" : "s"} ·{" "}
            <a
              href={PRICING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:text-indigo-600 underline"
            >
              estimate cost
            </a>
          </p>
        </div>
      </div>

      {/* Recent digests */}
      {recentDigests.length > 0 && (
        <div className="settings-card mt-2.5 overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
            Recent digests
          </p>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {recentDigests.map((d, i) => (
              <div
                key={d.runId ?? d.generatedAt ?? i}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <IconCircle color="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                  <Newspaper className="w-4 h-4" />
                </IconCircle>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    {formatShortDate(d.generatedAt)} digest
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {d.items.length} item{d.items.length === 1 ? "" : "s"} ·{" "}
                    {d.pillars?.length ?? 0} pillar
                    {(d.pillars?.length ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TokenChart({ data }: { data: TokenDayRecord[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const last14 = data.slice(-14);
  if (last14.length === 0) {
    return (
      <p className="text-sm text-stone-400 dark:text-stone-500 py-4 text-center">
        No usage data yet. Run a digest or generate a profile to start tracking.
      </p>
    );
  }

  const W = 320;
  const H = 128;
  const pad = { t: 10, r: 6, b: 6, l: 6 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const maxY = Math.max(...last14.map((d) => d.totalTokens), 1);

  const toX = (i: number) =>
    last14.length === 1 ? pad.l + plotW / 2 : pad.l + (i / (last14.length - 1)) * plotW;
  const toY = (v: number) => pad.t + plotH - (v / maxY) * plotH;

  const inputPts = last14.map((d, i) => ({ x: toX(i), y: toY(d.inputTokens), d }));
  const outputPts = last14.map((d, i) => ({ x: toX(i), y: toY(d.outputTokens), d }));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const gridLines = [0.25, 0.5, 0.75].map((pct) => {
    const y = pad.t + plotH * (1 - pct);
    return (
      <line
        key={pct}
        x1={pad.l}
        y1={y}
        x2={pad.l + plotW}
        y2={y}
        className="stroke-stone-200 dark:stroke-stone-700"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
    );
  });

  const hovered = hoveredIndex !== null ? last14[hoveredIndex] : null;
  const hoverX = hoveredIndex !== null ? toX(hoveredIndex) : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-32"
          role="img"
          aria-label="Daily token usage chart"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {gridLines}
          {last14.length > 1 && (
            <>
              <path
                d={toPath(outputPts)}
                fill="none"
                className="stroke-indigo-300 dark:stroke-indigo-700"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={toPath(inputPts)}
                fill="none"
                className="stroke-indigo-500 dark:stroke-indigo-400"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
          {last14.map((d, i) => {
            const colW = last14.length === 1 ? plotW : plotW / Math.max(last14.length - 1, 1);
            const x = last14.length === 1 ? pad.l : toX(i) - colW / 2;
            return (
              <rect
                key={`hit-${d.date}`}
                x={x}
                y={pad.t}
                width={colW}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredIndex(i)}
              />
            );
          })}
          {hoveredIndex !== null && (
            <line
              x1={hoverX}
              y1={pad.t}
              x2={hoverX}
              y2={pad.t + plotH}
              className="stroke-indigo-400/50 dark:stroke-indigo-500/50"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          {outputPts.map((p, i) => (
            <circle
              key={`out-${p.d.date}`}
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 5 : last14.length === 1 ? 4 : 3}
              className="fill-indigo-300 dark:fill-indigo-700 stroke-white dark:stroke-stone-900 pointer-events-none"
              strokeWidth={1.5}
            />
          ))}
          {inputPts.map((p, i) => (
            <circle
              key={`in-${p.d.date}`}
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 5 : last14.length === 1 ? 4 : 3}
              className="fill-indigo-500 dark:fill-indigo-400 stroke-white dark:stroke-stone-900 pointer-events-none"
              strokeWidth={1.5}
            />
          ))}
        </svg>
      </div>
      <div
        className={`rounded-lg px-3 py-2 text-xs transition-colors min-h-[52px] ${
          hovered
            ? "bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100"
            : "bg-stone-50 dark:bg-stone-900/50 text-stone-400 dark:text-stone-500"
        }`}
      >
        {hovered ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">{hovered.date}</span>
            <span>
              Input: <span className="tabular-nums font-medium">{hovered.inputTokens.toLocaleString()}</span>
            </span>
            <span>
              Output: <span className="tabular-nums font-medium">{hovered.outputTokens.toLocaleString()}</span>
            </span>
            <span>
              Total: <span className="tabular-nums font-medium">{hovered.totalTokens.toLocaleString()}</span>
            </span>
            <span className="text-stone-500 dark:text-stone-400">
              {hovered.runs} run{hovered.runs === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <span>Hover a day to see input, output, and run count</span>
        )}
      </div>
      <div className="flex items-end gap-1">
        {last14.map((d) => (
          <div key={d.date} className="flex-1 text-center">
            <span className="text-[9px] text-stone-400 dark:text-stone-500">
              {d.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0 border-t-2 border-indigo-500 dark:border-indigo-400 rounded-full" />{" "}
          Input
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0 border-t-2 border-indigo-300 dark:border-indigo-700 rounded-full" />{" "}
          Output
        </span>
        <span className="ml-auto">
          Total: {data.reduce((s, d) => s + d.totalTokens, 0).toLocaleString()} tokens
        </span>
      </div>
    </div>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function formatRunningDuration(startedAt?: string): string {
  if (!startedAt) return "just started";
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function RunActivityLog({ run }: { run: RunHistoryEntry }) {
  const live = run.status === "running";
  const log = useAgentActivity(live, run.activityLog ?? []);
  const entries = condenseActivityFeed(log);

  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-stone-400">
        {live ? "Waiting for agent activity…" : "No activity log saved for this run."}
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 px-1 py-1 max-h-40 overflow-y-auto">
      {entries.map((entry, i) => (
        <ActivityRow key={`${entry.ts}-${i}`} entry={entry} />
      ))}
    </div>
  );
}

function RunHistoryList({ runs }: { runs: RunHistoryEntry[] }) {
  const [, tick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasRunning = runs.some((r) => r.status === "running");

  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [hasRunning]);

  if (runs.length === 0) {
    return (
      <p className="px-4 pb-4 text-xs text-stone-400 dark:text-stone-500">
        No runs yet. History starts with your next digest or profile run.
      </p>
    );
  }

  return (
    <div className="border-t border-stone-100 dark:border-stone-800 max-h-56 overflow-y-auto">
      {runs.map((run) => {
        const when = run.finishedAt ? new Date(run.finishedAt) : run.startedAt ? new Date(run.startedAt) : null;
        const statusColor =
          run.status === "running"
            ? "text-sky-600 dark:text-sky-400"
            : run.status === "succeeded"
              ? "text-emerald-600 dark:text-emerald-400"
              : run.status === "cancelled"
                ? "text-stone-500"
                : "text-rose-600 dark:text-rose-400";
        return (
          <div
            key={run.id}
            className="border-b border-stone-50 dark:border-stone-800/50 last:border-0"
          >
            <button
              type="button"
              onClick={() => setExpandedId((id) => (id === run.id ? null : run.id))}
              className="w-full px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-medium capitalize ${statusColor}`}>
                  {run.status === "running" ? "Running" : run.status}
                </span>
                <span className="text-stone-400">·</span>
                <span className="text-stone-600 dark:text-stone-300 capitalize">{run.kind}</span>
                {run.trigger && (
                  <>
                    <span className="text-stone-400">·</span>
                    <span className="text-stone-500">{run.trigger}</span>
                  </>
                )}
                {when && (
                  <span className="ml-auto text-stone-400 tabular-nums">
                    {when.toLocaleDateString()}{" "}
                    {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-500">
                <span>
                  {run.status === "running"
                    ? formatRunningDuration(run.startedAt)
                    : formatDuration(run.durationMs)}
                </span>
                {run.itemCount !== undefined && (
                  <>
                    <span>·</span>
                    <span>{run.itemCount} items</span>
                  </>
                )}
                {run.activitySummary && (
                  <>
                    <span>·</span>
                    <span className="truncate">{run.activitySummary}</span>
                  </>
                )}
              </div>
              {run.error && expandedId !== run.id && (
                <p className="mt-1 text-[11px] text-rose-500 dark:text-rose-400 truncate">
                  {friendlyAgentError(run.error)}
                </p>
              )}
            </button>
            {expandedId === run.id && (
              <div className="px-4 pb-3 space-y-2">
                {run.error && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 whitespace-pre-wrap break-words font-mono leading-relaxed bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2 border border-rose-100 dark:border-rose-900/40">
                    {run.error}
                  </p>
                )}
                <RunActivityLog run={run} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [runStatus, setRunStatus] = useState("");
  const [runState, setRunState] = useState<AgentRunState | undefined>();
  const [saved, setSaved] = useState(false);
  const [tokenData, setTokenData] = useState<TokenDayRecord[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [stats, setStats] = useState<StatsState | undefined>();
  const [digestHistory, setDigestHistory] = useState<Digest[]>([]);
  const [disableRateLimit, setDisableRateLimit] = useState(false);
  const [cloudModel, setCloudModel] = useState<string>(DEFAULT_CLOUD_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<keyof CustomPrompts | null>(null);
  const [promptText, setPromptText] = useState("");
  const [customPrompts, setCustomPrompts] = useState<CustomPrompts>({});
  const [promptSaved, setPromptSaved] = useState(false);
  const profileImportRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    void ensureSeedData().then(async () => {
      const key = await getFromStorage(STORAGE_KEYS.apiKey);
      const t = await getFromStorage(STORAGE_KEYS.theme);
      const run = await getFromStorage(STORAGE_KEYS.runState);
      const tokens = await getFromStorage(STORAGE_KEYS.tokenUsage);
      const history = await getFromStorage(STORAGE_KEYS.runHistory);
      const noLimit = await getFromStorage(STORAGE_KEYS.disableRateLimit);
      const model = await getFromStorage(STORAGE_KEYS.cloudModel);
      const prompts = await getFromStorage(STORAGE_KEYS.customPrompts);
      const statsState = await getFromStorage(STORAGE_KEYS.stats);
      const digests = await getFromStorage(STORAGE_KEYS.digestHistory);
      setApiKey(key ?? "");
      setCloudModel(model || DEFAULT_CLOUD_MODEL);
      setStats(statsState);
      setDigestHistory(digests ?? []);
      if (key?.trim()) void loadModels(key);
      setTheme(t ?? "system");
      setRunState(run);
      setRunStatus(run?.status ?? "idle");
      setTokenData(tokens ?? []);
      setRunHistory(history ?? []);
      setDisableRateLimit(noLimit ?? false);
      setCustomPrompts(prompts ?? {});
      applyTheme(t ?? "system");
    });

    function onStorage(changes: Record<string, chrome.storage.StorageChange>): void {
      if (changes[STORAGE_KEYS.runState]) {
        const run = changes[STORAGE_KEYS.runState].newValue as AgentRunState | undefined;
        setRunState(run);
        if (run?.status) setRunStatus(run.status);
      }
      if (changes[STORAGE_KEYS.tokenUsage]) {
        setTokenData((changes[STORAGE_KEYS.tokenUsage].newValue as TokenDayRecord[]) ?? []);
      }
      if (changes[STORAGE_KEYS.runHistory]) {
        setRunHistory((changes[STORAGE_KEYS.runHistory].newValue as RunHistoryEntry[]) ?? []);
      }
      if (changes[STORAGE_KEYS.stats]) {
        setStats(changes[STORAGE_KEYS.stats].newValue as StatsState | undefined);
      }
      if (changes[STORAGE_KEYS.digestHistory]) {
        setDigestHistory((changes[STORAGE_KEYS.digestHistory].newValue as Digest[]) ?? []);
      }
    }

    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, []);

  async function save(): Promise<void> {
    await setInStorage(STORAGE_KEYS.apiKey, apiKey.trim());
    await setInStorage(STORAGE_KEYS.theme, theme);
    await setInStorage(STORAGE_KEYS.disableRateLimit, disableRateLimit);
    applyTheme(theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleRateLimit(): Promise<void> {
    const next = !disableRateLimit;
    setDisableRateLimit(next);
    await setInStorage(STORAGE_KEYS.disableRateLimit, next);
  }

  async function loadModels(key?: string): Promise<void> {
    setModelsLoading(true);
    try {
      const res = await chrome.runtime.sendMessage({
        type: "LIST_MODELS",
        apiKey: key?.trim() || apiKey.trim() || undefined,
      });
      if (res?.ok && Array.isArray(res.models)) {
        setAvailableModels(
          res.models.filter((m: unknown): m is string => typeof m === "string"),
        );
      }
    } catch {
      // Leave availableModels as-is; the known defaults still render.
    } finally {
      setModelsLoading(false);
    }
  }

  async function selectModel(id: string): Promise<void> {
    setCloudModel(id);
    await setInStorage(STORAGE_KEYS.cloudModel, id);
  }

  async function refreshNow(): Promise<void> {
    if (runStatus === "running") return;
    setRunStatus("running");
    setRunState((prev) => ({
      ...prev,
      status: "running",
      kind: "digest",
      startedAt: new Date().toISOString(),
    }));

    try {
      const res = await chrome.runtime.sendMessage({ type: "REFRESH_NOW" });
      if (res?.ok) return;

      const run = await getFromStorage(STORAGE_KEYS.runState);
      setRunState(run);
      setRunStatus(run?.status ?? "idle");
      const msg = res?.error ?? "Could not start refresh";
      if (msg.includes("Rate limited")) setRunStatus("cooldown");
      alert(msg);
    } catch {
      const run = await getFromStorage(STORAGE_KEYS.runState);
      setRunState(run);
      setRunStatus(run?.status ?? "idle");
    }
  }

  function openPromptEditor(key: keyof CustomPrompts): void {
    setEditingPrompt(key);
    const custom = customPrompts[key];
    if (custom) {
      setPromptText(custom);
    } else {
      const pf = PROMPT_FILES.find((p) => p.key === key);
      setPromptText(pf ? readDefaultPrompt(pf.file) : "");
    }
    setPromptSaved(false);
  }

  async function savePrompt(): Promise<void> {
    if (!editingPrompt) return;
    const pf = PROMPT_FILES.find((p) => p.key === editingPrompt);
    const defaultText = pf ? readDefaultPrompt(pf.file) : "";
    const isDefault = !promptText || promptText === defaultText;
    const updated = { ...customPrompts };
    if (isDefault) {
      delete updated[editingPrompt];
    } else {
      updated[editingPrompt] = promptText;
    }
    setCustomPrompts(updated);
    await setInStorage(STORAGE_KEYS.customPrompts, updated);
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 2000);
  }

  async function exportProfile(): Promise<void> {
    const pov = (await getFromStorage(STORAGE_KEYS.userPov)) ?? DEFAULT_POV;
    const draft = userPovToProfileDraft(pov);
    const result = parseProfileImportJson(JSON.stringify(draft), 1);
    if (!result.ok) {
      setToast({
        id: `profile-export-error-${Date.now()}`,
        kind: "error",
        title: "Export failed",
        message: result.errors.join(" · "),
      });
      return;
    }
    const slug = draft.pillars[0]?.slug ?? "profile";
    downloadProfileJson(`pov-news-profile-${slug}.json`, draft);
    setToast({
      id: `profile-export-${Date.now()}`,
      kind: "success",
      title: "Profile exported",
      message: "JSON file downloaded to your device.",
    });
  }

  async function importProfileFromText(text: string): Promise<void> {
    const result = parseProfileImportJson(text, 1);
    if (!result.ok) {
      setToast({
        id: `profile-import-error-${Date.now()}`,
        kind: "error",
        title: "Import failed",
        message: result.errors.join(" · "),
      });
      return;
    }
    const existing = (await getFromStorage(STORAGE_KEYS.userPov)) ?? DEFAULT_POV;
    await setInStorage(STORAGE_KEYS.userPov, {
      ...existing,
      about: result.draft.about,
      pillars: result.draft.pillars,
      audiences: result.draft.audiences,
      sources: result.draft.sources,
    });
    await setInStorage(STORAGE_KEYS.profileDraft, result.draft);
    setToast({
      id: `profile-import-${Date.now()}`,
      kind: "success",
      title: "Profile imported",
      message: "Your next digest will use the updated POV.",
    });
  }

  function handleProfileFileImport(file: File): void {
    void file
      .text()
      .then((text) => importProfileFromText(text))
      .catch(() =>
        setToast({
          id: `profile-import-read-error-${Date.now()}`,
          kind: "error",
          title: "Import failed",
          message: "Could not read the selected file.",
        }),
      );
  }

  const themeOptions: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];

  const modelOptions: CloudModelInfo[] = (() => {
    const ids = [
      DEFAULT_CLOUD_MODEL,
      ...availableModels.filter((m) => m !== DEFAULT_CLOUD_MODEL),
    ];
    if (cloudModel && !ids.includes(cloudModel)) ids.push(cloudModel);
    return ids.map(cloudModelInfo);
  })();

  return (
    <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <input
        ref={profileImportRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProfileFileImport(file);
          e.target.value = "";
        }}
      />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Settings</h1>
        <button
          type="button"
          onClick={() => {
            window.location.href = chrome.runtime.getURL("src/newtab/index.html");
          }}
          className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          title="Back to feed"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Overview dashboard */}
      <Overview
        stats={stats}
        tokenData={tokenData}
        digestHistory={digestHistory}
        runHistory={runHistory}
      />

      {/* General settings */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2 px-1">
          General
        </h2>
        <div className="settings-card overflow-hidden">
          {/* API key */}
          <div className="settings-row">
            <IconCircle color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Key className="w-4 h-4" />
            </IconCircle>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Cursor API Key
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                <a
                  href="https://cursor.com/dashboard/integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-600 underline"
                >
                  Integrations
                </a>{" "}
                &rarr; User API Keys &rarr; Add
              </p>
            </div>
          </div>
          <div className="px-4 pt-1 pb-3">
            <input
              type="password"
              autoComplete="off"
              placeholder="crsr_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Cloud model */}
          <div className="settings-row border-t border-stone-100 dark:border-stone-800">
            <IconCircle color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <Cpu className="w-4 h-4" />
            </IconCircle>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Cloud model
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Model that scores and writes your digest ·{" "}
                <a
                  href={PRICING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-600 underline"
                >
                  see pricing
                </a>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={modelsLoading || !apiKey.trim()}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {modelsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div className="px-4 pb-4 pt-1">
            <div className="relative">
              <select
                value={cloudModel}
                onChange={(e) => void selectModel(e.target.value)}
                className="w-full appearance-none pl-3 pr-9 py-2.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " (default)" : ""} — {m.cost}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            </div>
          </div>

          {/* Theme */}
          <div className="settings-row">
            <IconCircle color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Sun className="w-4 h-4" />
            </IconCircle>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Theme & Display
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Light, dark, or match system
              </p>
            </div>
          </div>
          <div className="px-4 pb-3 flex gap-2">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTheme(opt.value);
                    applyTheme(opt.value);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    active
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 font-medium"
                      : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Profile */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2 px-1">
          Profile
        </h2>
        <div className="settings-card overflow-hidden">
          <div className="settings-row">
            <IconCircle color="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
              <User className="w-4 h-4" />
            </IconCircle>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                POV profile
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Export or import pillars, sources, and audiences as JSON
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void exportProfile()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button
                type="button"
                onClick={() => profileImportRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Digest */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2 px-1">
          Digest
        </h2>
        <div className="settings-card overflow-hidden">
          <div className="settings-row">
            <IconCircle color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <RefreshCw className={`w-4 h-4 ${runStatus === "running" ? "animate-spin" : ""}`} />
            </IconCircle>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Digest Run
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {runStatus === "running"
                  ? "Agent is researching news for you…"
                  : disableRateLimit
                    ? `Status: ${runStatus} · Daily at 7 AM · No refresh cooldown`
                    : `Status: ${runStatus} · Daily at 7 AM · 1 manual refresh/hour`}
              </p>
            </div>
            {runStatus !== "running" && (
              <button
                type="button"
                onClick={() => void refreshNow()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              >
                Refresh now
              </button>
            )}
          </div>
          <div className="settings-row border-t border-stone-100 dark:border-stone-800">
            <div className="flex-1 min-w-0 pl-12">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Disable refresh cooldown
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Allow manual refreshes back-to-back (uses more API credits)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={disableRateLimit}
              onClick={() => void toggleRateLimit()}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                disableRateLimit
                  ? "bg-indigo-500"
                  : "bg-stone-200 dark:bg-stone-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  disableRateLimit ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="border-t border-stone-100 dark:border-stone-800">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
              Run history
            </p>
            <RunHistoryList runs={runHistory} />
          </div>
          {runStatus === "running" && (
            <div className="border-t border-stone-100 dark:border-stone-800 p-4">
              <AgentActivityFeed
                active
                seed={runState?.activityLog ?? []}
                title="Agent activity"
                startedAt={runState?.startedAt}
                streamingItemCount={runState?.streamingItemCount}
                collapsible={false}
                maxHeight="max-h-40"
              />
            </div>
          )}
        </div>
      </section>

      {/* Token usage */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2 px-1">
          Token Usage
        </h2>
        <div className="settings-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <IconCircle color="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
              <BarChart3 className="w-4 h-4" />
            </IconCircle>
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Daily token consumption
            </p>
          </div>
          <TokenChart data={tokenData} />
        </div>
      </section>

      {/* Prompts */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2 px-1">
          Prompts
        </h2>
        <div className="settings-card overflow-hidden">
          {PROMPT_FILES.map((pf) => (
            <button
              key={pf.key}
              type="button"
              onClick={() => openPromptEditor(pf.key)}
              className="settings-row w-full text-left cursor-pointer"
            >
              <IconCircle color="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                <FileText className="w-4 h-4" />
              </IconCircle>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {pf.label}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {customPrompts[pf.key] ? "Custom override" : `Default (${pf.file})`}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* Prompt editor modal */}
      {editingPrompt && (
        <div className="fixed inset-0 z-50 bg-stone-50 dark:bg-stone-950 flex flex-col">
          {/* Top bar */}
          <header className="shrink-0 border-b border-stone-200/80 dark:border-stone-800/80 bg-white/80 dark:bg-stone-900/80 backdrop-blur">
            <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditingPrompt(null)}
                className="p-2 -ml-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
                aria-label="Back to settings"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                  Edit prompt
                </p>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 truncate">
                  {PROMPT_FILES.find((p) => p.key === editingPrompt)?.label}
                </h3>
              </div>
              {promptSaved && (
                <span className="text-xs text-emerald-500 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {customPrompts[editingPrompt] && (
                <button
                  type="button"
                  onClick={() => {
                    const pf = PROMPT_FILES.find((p) => p.key === editingPrompt);
                    setPromptText(pf ? readDefaultPrompt(pf.file) : "");
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  Reset to default
                </button>
              )}
              <button
                type="button"
                onClick={() => void savePrompt()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </header>

          {/* Editor body */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="max-w-3xl mx-auto w-full h-full px-4 sm:px-6 py-4 flex flex-col">
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                Leave empty to use the built-in default. Paste a custom prompt to override
                it for every future run.
              </p>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                spellCheck={false}
                placeholder="Leave empty to use the default prompt. Paste your custom prompt here to override."
                className="flex-1 min-h-0 w-full px-4 py-3.5 text-[13px] font-mono leading-relaxed rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Privacy */}
      <section>
        <div className="settings-card overflow-hidden">
          <a
            href="https://povnews.app/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-row cursor-pointer"
          >
            <IconCircle color="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
              <Shield className="w-4 h-4" />
            </IconCircle>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Privacy Policy
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Data never leaves your device except to api.cursor.com
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          </a>
        </div>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3 pb-8">
        <button
          type="button"
          onClick={() => void save()}
          className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm shadow-indigo-500/20 transition-colors"
        >
          Save settings
        </button>
        {saved && (
          <span className="text-sm text-emerald-500 flex items-center gap-1">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </main>
  );
}
