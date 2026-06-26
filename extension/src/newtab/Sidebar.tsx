import { Archive, Bot, Flame, Inbox, ScrollText, TrendingDown, TrendingUp } from "lucide-react";
import type { AgentRunState, Digest, RunPhase, UserPOV } from "../types/pov";
import { accentForPillarSlug, PILLAR_HEX } from "../design/tokens";
import { StatusDot } from "../design/components";
import { Sparkline } from "../design/components/Sparkline";
import { useStorage } from "./hooks/useStorage";
import { STORAGE_KEYS } from "../storage/schema";

export type SidebarFilter =
  | { kind: "all" }
  | { kind: "pillar"; slug: string }
  | { kind: "archived" }
  | { kind: "agent" };

type Props = {
  pov: UserPOV;
  digest: Digest | undefined;
  archivedIds: string[];
  filter: SidebarFilter;
  runState: AgentRunState | undefined;
  onSelectFilter: (filter: SidebarFilter) => void;
};

const PHASE_LABEL: Record<RunPhase, string> = {
  discovering: "Discovering",
  scoring: "Scoring",
  writing: "Writing",
  done: "Done",
};

function rowClass(active: boolean): string {
  return `w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${
    active
      ? "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-semibold"
      : "text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/60"
  }`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
      {children}
    </p>
  );
}

function CountPill({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={`text-[11px] tabular-nums shrink-0 rounded-full px-1.5 min-w-[1.25rem] text-center ${
        active
          ? "bg-white/70 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
          : "text-stone-400 dark:text-stone-500"
      }`}
    >
      {value}
    </span>
  );
}

function StatsFooter() {
  const [stats] = useStorage(STORAGE_KEYS.stats);
  if (!stats || stats.days.length === 0) return null;

  const last7 = stats.days.slice(-7);
  const prev7 = stats.days.slice(-14, -7);
  const deliveredSeries = last7.map((d) => d.delivered);
  const readSeries = last7.map((d) => d.read);
  const weekDelivered = deliveredSeries.reduce((a, b) => a + b, 0);
  const prevDelivered = prev7.reduce((a, b) => a + b.delivered, 0);
  const hasTrend = deliveredSeries.some((v) => v > 0) || readSeries.some((v) => v > 0);

  // Week-over-week delta, mirroring the "↑15% compared to last week" stat chips
  // in the reference designs. Only shown once there's a prior week to compare to.
  const deltaPct =
    prevDelivered > 0
      ? Math.round(((weekDelivered - prevDelivered) / prevDelivered) * 100)
      : null;

  return (
    <div className="shrink-0 p-3 border-t border-stone-100 dark:border-stone-800">
      <div className="card-flat p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            This week
          </span>
          {stats.streak > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <Flame className="w-3.5 h-3.5" strokeWidth={2} />
              {stats.streak}d
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <div className="text-xl font-bold tabular-nums leading-none text-rainbow">
                {weekDelivered}
              </div>
              {deltaPct !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
                    deltaPct >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-500 dark:text-rose-400"
                  }`}
                  title="vs. previous week"
                >
                  {deltaPct >= 0 ? (
                    <TrendingUp className="w-3 h-3" strokeWidth={2} />
                  ) : (
                    <TrendingDown className="w-3 h-3" strokeWidth={2} />
                  )}
                  {Math.abs(deltaPct)}%
                </span>
              )}
            </div>
            <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
              new · {stats.totalRead} read all-time
            </div>
          </div>
          {hasTrend && (
            <Sparkline
              data={deliveredSeries}
              width={84}
              height={30}
              className="w-[84px] h-[30px] shrink-0"
              ariaLabel="Articles delivered this week"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ pov, digest, archivedIds, filter, runState, onSelectFilter }: Props) {
  const archived = new Set(archivedIds);
  const activeItems = (digest?.items ?? []).filter((item) => !archived.has(item.id));

  const counts = new Map<string, number>();
  for (const item of activeItems) {
    counts.set(item.pillarSlug, (counts.get(item.pillarSlug) ?? 0) + 1);
  }

  const agentActive = filter.kind === "agent";
  const agentRunning = runState?.status === "running";
  const agentFailed = runState?.status === "failed";
  const phaseLabel =
    agentRunning && runState?.phase ? PHASE_LABEL[runState.phase] : agentRunning ? "Working" : null;

  return (
    <aside className="w-56 shrink-0 border-r border-stone-200/70 dark:border-stone-800/70 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <nav className="flex-1 overflow-y-auto scroll-thin px-2 py-2">
        <SectionLabel>Agent</SectionLabel>
        <button type="button" onClick={() => onSelectFilter({ kind: "agent" })} className={rowClass(agentActive)}>
          <Bot className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span className="text-sm flex-1">Agent</span>
          {agentRunning ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              <StatusDot state="live" pulse />
              {phaseLabel}
            </span>
          ) : agentFailed ? (
            <StatusDot state="error" />
          ) : null}
        </button>

        <SectionLabel>Feed</SectionLabel>
        <button type="button" onClick={() => onSelectFilter({ kind: "all" })} className={rowClass(filter.kind === "all")}>
          <Inbox className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span className="text-sm flex-1">All items</span>
          <CountPill value={activeItems.length} active={filter.kind === "all"} />
        </button>

        <SectionLabel>Pillars</SectionLabel>
        {pov.pillars.map((pillar) => {
          const accent = accentForPillarSlug(pov, pillar.slug);
          const count = counts.get(pillar.slug) ?? 0;
          const active = filter.kind === "pillar" && filter.slug === pillar.slug;
          return (
            <button
              key={pillar.slug}
              type="button"
              onClick={() => onSelectFilter({ kind: "pillar", slug: pillar.slug })}
              className={rowClass(active)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: PILLAR_HEX[accent] }}
              />
              <span className="text-sm flex-1 truncate">{pillar.name}</span>
              <CountPill value={count} active={active} />
            </button>
          );
        })}

        <div className="my-2" />
        <button
          type="button"
          onClick={() => onSelectFilter({ kind: "archived" })}
          className={rowClass(filter.kind === "archived")}
        >
          <Archive className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span className="text-sm flex-1">Archived</span>
          <CountPill value={archivedIds.length} active={filter.kind === "archived"} />
        </button>
      </nav>

      <StatsFooter />

      <div className="shrink-0 px-3 py-2 border-t border-stone-100 dark:border-stone-800">
        <a
          href="https://povnews.app/changelog"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
        >
          <ScrollText className="w-3.5 h-3.5" strokeWidth={1.75} />
          Changelog
        </a>
      </div>
    </aside>
  );
}
