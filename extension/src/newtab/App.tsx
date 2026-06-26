import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Check,
  Settings,
  Sun,
  Moon,
  Monitor,
  Search,
  ChevronRight,
} from "lucide-react";
import { Sidebar, type SidebarFilter } from "./Sidebar";
import { ItemList } from "./ItemList";
import { ReaderPane, type ReaderPaneHandle } from "./ReaderPane";
import { Toolbar } from "./Toolbar";
import { DriftBanner } from "./DriftBanner";
import { RunsView } from "./RunsView";
import { ShareModal } from "./ShareModal";
import { Toast, type ToastPayload } from "./Toast";
import { AgentActivityFeed } from "../components/AgentActivityFeed";
import { friendlyAgentError } from "../utils/agentActivity";
import { sendToWorker } from "../utils/messaging";
import { useStorage } from "./hooks/useStorage";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTypeToSearch } from "./hooks/useTypeToSearch";
import { Wizard } from "../onboarding/Wizard";
import {
  STORAGE_KEYS,
  setInStorage,
  type ThemePreference,
  type ViewMode,
} from "../storage/schema";
import { detectPillarDrift } from "../storage/feedback";
import { DEFAULT_POV } from "../types/defaultPov";
import type { DigestItem, ItemRating, PillarDriftAlert } from "../types/pov";
import { searchDigests } from "../utils/search";
import { digestToMarkdown, downloadMarkdown } from "../utils/exportMarkdown";

const POLL_INTERVAL_MS = 10_000;

function filtersMatch(a: SidebarFilter, b: SidebarFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "pillar" && b.kind === "pillar") return a.slug === b.slug;
  return true;
}

function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

function ThemeToggle({
  current,
  onChange,
}: {
  current: ThemePreference;
  onChange: (t: ThemePreference) => void;
}) {
  const options: { value: ThemePreference; icon: typeof Sun }[] = [
    { value: "light", icon: Sun },
    { value: "system", icon: Monitor },
    { value: "dark", icon: Moon },
  ];
  return (
    <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`p-1.5 rounded-md transition-colors ${
              current === opt.value
                ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm"
                : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function App() {
  const [onboardingComplete, setOnboardingComplete] = useStorage(
    STORAGE_KEYS.onboardingComplete,
  );
  const [digest] = useStorage(STORAGE_KEYS.latestDigest);
  const [history] = useStorage(STORAGE_KEYS.digestHistory);
  const [pov] = useStorage(STORAGE_KEYS.userPov);
  const [runState] = useStorage(STORAGE_KEYS.runState);
  const [ratings] = useStorage(STORAGE_KEYS.itemRatings);
  const [theme] = useStorage(STORAGE_KEYS.theme);
  const [viewMode] = useStorage(STORAGE_KEYS.viewMode);
  const [archivedIds] = useStorage(STORAGE_KEYS.archivedItemIds);

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ kind: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [driftAlerts, setDriftAlerts] = useState<PillarDriftAlert[]>([]);
  const [driftDismissed, setDriftDismissed] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [stoppingRun, setStoppingRun] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const prevStatusRef = useRef(runState?.status);
  const lastFailedAtRef = useRef<string | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readerRef = useRef<ReaderPaneHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (runState?.status === "running") setRefreshPending(false);

    const prev = prevStatusRef.current;
    prevStatusRef.current = runState?.status;
    if (prev === "running" && runState?.status === "succeeded") {
      setShowSuccess(true);
      setToast({
        id: `success-${runState.finishedAt ?? Date.now()}`,
        kind: "success",
        title: "Digest updated",
        message: runState.itemCount
          ? `${runState.itemCount} new item${runState.itemCount === 1 ? "" : "s"} added`
          : "Digest run completed",
        actionLabel: "View run",
        onAction: () => setSidebarFilter({ kind: "agent" }),
      });
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    }
    if (
      prev === "running" &&
      runState?.status === "failed" &&
      runState.finishedAt &&
      runState.finishedAt !== lastFailedAtRef.current
    ) {
      lastFailedAtRef.current = runState.finishedAt;
      setRefreshPending(false);
      const friendly = friendlyAgentError(runState.error ?? "Run failed");
      setToast({
        id: `error-${runState.finishedAt}`,
        kind: "error",
        title: "Digest run failed",
        message: friendly,
        actionLabel: "View details",
        onAction: () => {
          setSidebarFilter({ kind: "agent" });
        },
      });
    }
  }, [runState?.status, runState?.finishedAt, runState?.error, runState?.itemCount]);

  useEffect(() => {
    const digestRunning =
      runState?.status === "running" && (runState.kind === "digest" || !runState.kind);

    if (!digestRunning) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    if (pollRef.current) return;

    void sendToWorker({ type: "POLL_ACTIVE_RUN" }).catch(() => {});
    pollRef.current = setInterval(() => {
      void sendToWorker({ type: "POLL_ACTIVE_RUN" }).catch(() => {});
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runState?.status, runState?.kind]);

  useEffect(() => {
    if (runState?.status !== "running") {
      setStoppingRun(false);
    }
  }, [runState?.status]);

  const effectivePov = pov ?? DEFAULT_POV;
  const effectiveTheme: ThemePreference = theme ?? "system";
  const effectiveViewMode = (viewMode ?? "list") as ViewMode;
  const archived = new Set(archivedIds ?? []);

  useEffect(() => {
    applyTheme(effectiveTheme);
    if (effectiveTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [effectiveTheme]);

  useEffect(() => {
    if (driftDismissed) return;
    void detectPillarDrift().then(setDriftAlerts);
  }, [ratings, driftDismissed]);

  const baseItems = useMemo(() => {
    const all = digest?.items ?? [];
    return all.filter((i) => !archived.has(i.id));
  }, [digest, archived]);

  const archivedItems = useMemo(() => {
    const all = digest?.items ?? [];
    return all.filter((i) => archived.has(i.id));
  }, [digest, archived]);

  const filteredItems = useMemo(() => {
    if (sidebarFilter.kind === "agent") return [];

    if (sidebarFilter.kind === "archived") {
      if (searchQuery.trim()) {
        return searchDigests(history ?? [], digest, searchQuery).filter((i) =>
          archived.has(i.id),
        );
      }
      return archivedItems;
    }

    if (searchQuery.trim()) {
      return searchDigests(history ?? [], digest, searchQuery).filter(
        (i) => !archived.has(i.id),
      );
    }
    if (sidebarFilter.kind === "all") return baseItems;
    return baseItems.filter((i) => i.pillarSlug === sidebarFilter.slug);
  }, [baseItems, archivedItems, sidebarFilter, searchQuery, history, digest, archived]);

  const selectedItem: DigestItem | null =
    filteredItems.find((i) => i.id === selectedId) ??
    filteredItems[0] ??
    null;

  const newsFilters = useMemo((): SidebarFilter[] => {
    const order: SidebarFilter[] = [{ kind: "all" }];
    for (const pillar of effectivePov.pillars) {
      order.push({ kind: "pillar", slug: pillar.slug });
    }
    order.push({ kind: "archived" });
    return order;
  }, [effectivePov.pillars]);

  const itemsForFilter = useCallback(
    (filter: SidebarFilter): DigestItem[] => {
      if (filter.kind === "archived") return archivedItems;
      if (filter.kind === "all") return baseItems;
      if (filter.kind === "pillar") {
        return baseItems.filter((i) => i.pillarSlug === filter.slug);
      }
      return [];
    },
    [baseItems, archivedItems],
  );

  const handleMoveDown = useCallback(() => {
    if (sidebarFilter.kind === "agent") return;

    if (filteredItems.length === 0) {
      const fi = newsFilters.findIndex((f) => filtersMatch(f, sidebarFilter));
      if (fi < 0 || fi >= newsFilters.length - 1) return;
      const nextFilter = newsFilters[fi + 1]!;
      setSearchQuery("");
      setSidebarFilter(nextFilter);
      const nextItems = itemsForFilter(nextFilter);
      setSelectedId(nextItems[0]?.id ?? null);
      return;
    }

    const currentId = selectedItem?.id ?? selectedId;
    const idx = filteredItems.findIndex((i) => i.id === currentId);
    const currentIdx = idx >= 0 ? idx : 0;

    if (currentIdx < filteredItems.length - 1) {
      setSelectedId(filteredItems[currentIdx + 1]!.id);
      return;
    }

    const fi = newsFilters.findIndex((f) => filtersMatch(f, sidebarFilter));
    if (fi < 0 || fi >= newsFilters.length - 1) return;
    const nextFilter = newsFilters[fi + 1]!;
    setSearchQuery("");
    setSidebarFilter(nextFilter);
    const nextItems = itemsForFilter(nextFilter);
    setSelectedId(nextItems[0]?.id ?? null);
  }, [
    sidebarFilter,
    filteredItems,
    selectedItem?.id,
    selectedId,
    newsFilters,
    itemsForFilter,
  ]);

  const handleMoveUp = useCallback(() => {
    if (sidebarFilter.kind === "agent") return;

    if (filteredItems.length === 0) {
      const fi = newsFilters.findIndex((f) => filtersMatch(f, sidebarFilter));
      if (fi <= 0) return;
      const prevFilter = newsFilters[fi - 1]!;
      setSearchQuery("");
      setSidebarFilter(prevFilter);
      const prevItems = itemsForFilter(prevFilter);
      setSelectedId(prevItems[prevItems.length - 1]?.id ?? null);
      return;
    }

    const currentId = selectedItem?.id ?? selectedId;
    const idx = filteredItems.findIndex((i) => i.id === currentId);
    const currentIdx = idx >= 0 ? idx : 0;

    if (currentIdx > 0) {
      setSelectedId(filteredItems[currentIdx - 1]!.id);
      return;
    }

    const fi = newsFilters.findIndex((f) => filtersMatch(f, sidebarFilter));
    if (fi <= 0) return;
    const prevFilter = newsFilters[fi - 1]!;
    setSearchQuery("");
    setSidebarFilter(prevFilter);
    const prevItems = itemsForFilter(prevFilter);
    setSelectedId(prevItems[prevItems.length - 1]?.id ?? null);
  }, [
    sidebarFilter,
    filteredItems,
    selectedItem?.id,
    selectedId,
    newsFilters,
    itemsForFilter,
  ]);

  async function handleStop(): Promise<void> {
    setStoppingRun(true);
    try {
      await chrome.runtime.sendMessage({ type: "CANCEL_AGENT_RUN" });
    } finally {
      setStoppingRun(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    const isRunning = runState?.status === "running" || refreshPending;
    if (isRunning) return;
    setRefreshPending(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: "REFRESH_NOW" });
      if (res && !res.ok) {
        setRefreshPending(false);
        const message = friendlyAgentError(res.error ?? "Refresh failed");
        setToast({
          id: `refresh-${Date.now()}`,
          kind: "error",
          title: "Could not start refresh",
          message,
        });
      }
    } catch {
      setRefreshPending(false);
    }
  }

  const digestRunning = runState?.status === "running" || refreshPending;

  async function handleRate(id: string, rating: ItemRating): Promise<void> {
    const item =
      baseItems.find((i) => i.id === id) ?? filteredItems.find((i) => i.id === id);
    if (!item) return;
    const next = { ...(ratings ?? {}), [id]: rating };
    await setInStorage(STORAGE_KEYS.itemRatings, next);
    await chrome.runtime.sendMessage({ type: "APPLY_FEEDBACK", item });
  }

  function markRead(id: string): void {
    void chrome.runtime.sendMessage({ type: "MARK_READ", itemId: id }).catch(() => {});
  }

  async function handleArchive(id: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: "ARCHIVE_ITEM", itemId: id });
    const next = filteredItems.filter((i) => i.id !== id);
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null);
    }
  }

  async function handleUnarchive(id: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: "UNARCHIVE_ITEM", itemId: id });
    const next = filteredItems.filter((i) => i.id !== id);
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null);
    }
  }

  function handleExport(): void {
    if (!digest) return;
    const md = digestToMarkdown(digest);
    const date = new Date(digest.generatedAt).toISOString().slice(0, 10);
    downloadMarkdown(`pov-news-${date}.md`, md);
  }

  function handleThemeChange(t: ThemePreference): void {
    void setInStorage(STORAGE_KEYS.theme, t);
    applyTheme(t);
  }

  // Opening an item in the reader counts as reading it (idempotent server-side).
  useEffect(() => {
    if (selectedItem) markRead(selectedItem.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id]);

  useKeyboardShortcuts({
    onMoveDown: handleMoveDown,
    onMoveUp: handleMoveUp,
    onOpenDetails: () => readerRef.current?.openDetails(),
    onGoBack: () => {
      readerRef.current?.goBack();
    },
    onShare: () => {
      if (selectedItem) setShareOpen(true);
    },
    onThumbsUp: () => {
      if (selectedItem) void handleRate(selectedItem.id, "up");
    },
    onThumbsDown: () => {
      if (selectedItem) void handleRate(selectedItem.id, "down");
    },
    onDismiss: () => {
      if (selectedItem) void handleRate(selectedItem.id, "dismiss");
    },
    onArchive: () => {
      if (!selectedItem) return;
      if (sidebarFilter.kind === "archived") {
        void handleUnarchive(selectedItem.id);
      } else {
        void handleArchive(selectedItem.id);
      }
    },
    onMarkRead: () => {
      if (selectedItem) markRead(selectedItem.id);
    },
    onOpen: () => {
      if (selectedItem) window.open(selectedItem.url, "_blank");
    },
    enabled:
      onboardingComplete !== false &&
      !showWizard &&
      !shareOpen &&
      sidebarFilter.kind !== "agent",
  });

  const searchShortcutsEnabled =
    onboardingComplete !== false &&
    !showWizard &&
    !shareOpen &&
    sidebarFilter.kind !== "agent";

  useTypeToSearch(
    searchRef,
    (updater) => setSearchQuery(updater),
    () => setSearchQuery(""),
    searchShortcutsEnabled,
  );

  if (onboardingComplete === false || showWizard) {
    return (
      <Wizard
        onComplete={() => {
          setShowWizard(false);
        }}
      />
    );
  }

  const crumbLabel =
    sidebarFilter.kind === "all"
      ? "All items"
      : sidebarFilter.kind === "archived"
        ? "Archived"
        : sidebarFilter.kind === "agent"
          ? "Agent"
          : effectivePov.pillars.find((p) => p.slug === sidebarFilter.slug)?.name ??
            "Pillar";

  const statusLabel = digestRunning
      ? runState?.streamingItemCount
        ? `Researching… ${runState.streamingItemCount} new`
        : `Running ${runState?.kind ?? "digest"}…`
      : runState?.status === "succeeded"
        ? `Updated ${runState.finishedAt ? new Date(runState.finishedAt).toLocaleString() : ""}`
        : "Ready";

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-stone-950">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ShareModal
        item={selectedItem}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onCopied={() =>
          setToast({
            id: `copy-${Date.now()}`,
            kind: "success",
            title: "Link copied",
            message: "Article URL copied to clipboard",
          })
        }
      />
      {/* Header */}
      <header className="shrink-0 grid grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)_minmax(0,1fr)] items-center gap-3 px-5 py-3 border-b border-stone-200/80 dark:border-stone-800/80 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm z-10 relative">
        <div className="flex items-center gap-3 min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 shrink-0 min-w-0"
          >
            <h1 className="text-sm font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              POV News
            </h1>
            <ChevronRight
              className="w-3.5 h-3.5 text-stone-300 dark:text-stone-600 shrink-0"
              strokeWidth={2}
            />
            <span className="text-sm font-medium text-stone-500 dark:text-stone-400 truncate">
              {crumbLabel}
            </span>
          </nav>
          <span className="text-xs text-stone-400 dark:text-stone-500 truncate">
            {statusLabel}
            {digestRunning && sidebarFilter.kind !== "agent" && (
              <button
                type="button"
                onClick={() => setSidebarFilter({ kind: "agent" })}
                className="ml-2 text-indigo-500 dark:text-indigo-400 hover:underline font-medium"
              >
                Agent
              </button>
            )}
            {runState?.status === "failed" && sidebarFilter.kind !== "agent" && (
              <button
                type="button"
                onClick={() => setSidebarFilter({ kind: "agent" })}
                className="ml-2 text-rose-500 dark:text-rose-400 hover:underline font-medium"
              >
                Details
              </button>
            )}
          </span>
        </div>

        <div className="relative w-full justify-self-center">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400"
            strokeWidth={1.75}
          />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search digests"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Search digests…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-1">
        <ThemeToggle current={effectiveTheme} onChange={handleThemeChange} />
        <button
          type="button"
          className={`group relative p-2 rounded-lg transition-colors ${
            showSuccess
              ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
              : digestRunning
                ? "text-sky-500 bg-sky-50 dark:bg-sky-900/20"
                : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
          aria-label={
            digestRunning
              ? "Researching news…"
              : showSuccess
                ? "Digest updated!"
                : "Refresh now"
          }
          onClick={() => void handleRefresh()}
          disabled={digestRunning}
        >
          {showSuccess ? (
            <Check className="w-4 h-4" strokeWidth={2} />
          ) : (
            <RefreshCw
              className={`w-4 h-4 ${digestRunning ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
          )}
          <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-800 dark:bg-stone-200 px-2 py-1 text-[10px] text-white dark:text-stone-900 opacity-0 group-hover:opacity-100 transition-opacity z-50">
            {digestRunning
              ? "Researching news…"
              : showSuccess
                ? "Digest updated!"
                : "Refresh now"}
          </span>
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="Settings"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings className="w-4 h-4" strokeWidth={1.75} />
        </button>
        </div>
      </header>

      {!driftDismissed && driftAlerts.length > 0 && (
        <DriftBanner
          alerts={driftAlerts}
          onDismiss={() => setDriftDismissed(true)}
          onEditPov={() => setShowWizard(true)}
        />
      )}

      <Toolbar
        viewMode={effectiveViewMode}
        onViewModeChange={(m) => void setInStorage(STORAGE_KEYS.viewMode, m)}
        onExport={handleExport}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          pov={effectivePov}
          digest={digest}
          archivedIds={archivedIds ?? []}
          filter={sidebarFilter}
          runState={runState}
          onSelectFilter={(next) => {
            setSidebarFilter(next);
            setSelectedId(null);
            setSearchQuery("");
          }}
        />
        {sidebarFilter.kind === "agent" ? (
          <RunsView runState={runState} onStop={handleStop} />
        ) : (
          <>
            <div className="w-96 shrink-0 border-r border-stone-200/80 dark:border-stone-800/80 flex flex-col min-h-0 bg-white dark:bg-stone-900">
              {digestRunning &&
                (refreshPending || runState?.kind === "digest" || !runState?.kind) && (
                  <div className="shrink-0 p-2 border-b border-stone-100 dark:border-stone-800">
                    <AgentActivityFeed
                      active
                      seed={runState?.activityLog ?? []}
                      title="Researching news for you"
                      startedAt={runState?.startedAt}
                      streamingItemCount={runState?.streamingItemCount}
                      onStop={() => void handleStop()}
                      onOpenDetails={() => setSidebarFilter({ kind: "agent" })}
                      cancelling={stoppingRun}
                      className="text-[11px]"
                      maxHeight="max-h-48"
                    />
                  </div>
                )}
              <ItemList
                items={filteredItems}
                selectedId={selectedItem?.id ?? null}
                ratings={ratings ?? {}}
                viewMode={effectiveViewMode}
                pov={effectivePov}
                archivedView={sidebarFilter.kind === "archived"}
                onSelect={setSelectedId}
                onRate={handleRate}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
              />
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-stone-50 dark:bg-stone-950">
              <ReaderPane ref={readerRef} item={selectedItem} pov={effectivePov} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
