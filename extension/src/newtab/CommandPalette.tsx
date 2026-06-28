import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Digest, DigestItem } from "../types/pov";
import { searchDigests } from "../utils/search";
import { ItemThumbnail } from "./components/ItemMedia";

type Props = {
  open: boolean;
  onClose: () => void;
  history: Digest[];
  digest: Digest | undefined;
  archivedIds: string[];
  initialQuery: string;
  onChoose: (item: DigestItem, query: string) => void;
};

const MAX_RESULTS = 12;
const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toLowerCase().includes("mac");

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 dark:text-stone-400">
      {children}
    </kbd>
  );
}

export function CommandPalette({
  open,
  onClose,
  history,
  digest,
  archivedIds,
  initialQuery,
  onChoose,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setSelected(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, initialQuery]);

  const archived = useMemo(() => new Set(archivedIds), [archivedIds]);

  const results = useMemo(() => {
    if (!open) return [];
    const q = query.trim();
    if (q) return searchDigests(history, digest, q).slice(0, MAX_RESULTS);
    // No query → recent items from the current digest, highest score first.
    return (digest?.items ?? [])
      .filter((i) => !archived.has(i.id))
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);
  }, [open, query, history, digest, archived]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  function choose(item: DigestItem | undefined): void {
    if (!item) return;
    onChoose(item, query.trim());
  }

  function onKey(e: React.KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) setSelected((s) => (s + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length)
        setSelected((s) => (s - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[selected]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh] bg-black/40 dark:bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Search digests"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-stone-100 dark:border-stone-800 px-4 py-3.5">
          <Search
            className="w-4 h-4 shrink-0 text-stone-400"
            strokeWidth={1.75}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search digests…"
            className="flex-1 bg-transparent text-[15px] text-stone-900 dark:text-stone-100 outline-none placeholder:text-stone-400"
          />
          <Kbd>esc</Kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[56vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-stone-400">
              {query.trim() ? "No matches." : "No items yet."}
            </div>
          ) : (
            <>
              {!query.trim() && (
                <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                  Recent
                </div>
              )}
              {results.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  data-idx={idx}
                  onMouseMove={() => setSelected(idx)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    idx === selected
                      ? "bg-indigo-50 dark:bg-indigo-900/20"
                      : "hover:bg-stone-50 dark:hover:bg-stone-800/60"
                  }`}
                >
                  <ItemThumbnail
                    url={item.url}
                    imageUrl={item.imageUrl}
                    faviconUrl={item.faviconUrl}
                    className="w-9 h-9"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                      {item.title}
                    </div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                      {item.source}
                      {item.published ? ` · ${item.published}` : ""}
                    </div>
                  </div>
                  {item.pillarName && (
                    <span className="shrink-0 text-[11px] font-medium text-stone-400">
                      {item.pillarName}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/30 px-4 py-2.5 text-[11px] text-stone-400">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> Open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>{isMac ? "⌘" : "Ctrl"} K</Kbd> Toggle
          </span>
        </div>
      </div>
    </div>
  );
}
