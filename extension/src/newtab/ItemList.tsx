import { useEffect, useRef } from "react";
import { Archive, ArchiveRestore, Ban, ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import type { DigestItem, ItemRating, UserPOV, ViewMode } from "../types/pov";
import { ScoreBadge } from "../design/components/Badge";
import { Tooltip } from "../design/components/Tooltip";
import { accentForPillarSlug, PILLAR_HEX, resolvePillarName } from "../design/tokens";
import { ItemFavicon, ItemHero, ItemThumbnail } from "./components/ItemMedia";

type Props = {
  items: DigestItem[];
  selectedId: string | null;
  ratings: Record<string, ItemRating>;
  viewMode: ViewMode;
  pov: UserPOV;
  archivedView?: boolean;
  onSelect: (id: string) => void;
  onRate: (id: string, rating: ItemRating) => void;
  onArchive: (id: string) => void;
  onUnarchive?: (id: string) => void;
};

function scrollSelectedToCenter(
  container: HTMLElement,
  item: HTMLElement,
): void {
  const targetTop =
    item.offsetTop - container.clientHeight / 2 + item.offsetHeight / 2;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTo({
    top: Math.max(0, Math.min(targetTop, maxScroll)),
    behavior: "smooth",
  });
}

function isEditableFocused(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

function ActionButton({
  active,
  activeColor,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  activeColor?: string;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} placement="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        className={`p-1.5 rounded-lg transition-colors ${
          active
            ? activeColor ?? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
            : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function ItemList({
  items,
  selectedId,
  ratings,
  viewMode,
  pov,
  archivedView = false,
  onSelect,
  onRate,
  onArchive,
  onUnarchive,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement | HTMLButtonElement>());

  useEffect(() => {
    if (!selectedId) return;
    const el = itemRefs.current.get(selectedId);
    const container = scrollRef.current;
    if (!el || !container) return;

    if (!isEditableFocused()) {
      el.focus({ preventScroll: true });
    }
    requestAnimationFrame(() => scrollSelectedToCenter(container, el));
  }, [selectedId, items]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-stone-400 dark:text-stone-500 px-6">
        <p className="text-sm">
          {archivedView ? "No archived items." : "No items to show."}
        </p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 grid grid-cols-1 gap-2">
        {items.map((item) => {
          const selected = selectedId === item.id;
          const accentHex = PILLAR_HEX[accentForPillarSlug(pov, item.pillarSlug)];
          return (
          <button
            key={item.id}
            type="button"
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            onClick={() => onSelect(item.id)}
            style={selected ? { borderColor: `${accentHex}66` } : undefined}
            className={`text-left rounded-2xl p-4 transition-all duration-150 border outline-none ${
              selected
                ? "bg-stone-50 dark:bg-stone-800/40 soft-shadow"
                : "border-stone-100 dark:border-stone-800 hover:border-stone-200 dark:hover:border-stone-700 hover:shadow-sm"
            }`}
          >
            <ItemHero
              url={item.url}
              imageUrl={item.imageUrl}
              faviconUrl={item.faviconUrl}
              source={item.source}
              title={item.title}
              className="mb-3 h-28"
            />
            <div className="flex items-center gap-2 mb-2">
              <ScoreBadge score={item.score} />
              <span className="text-[10px] uppercase tracking-wide text-stone-400">
                {resolvePillarName(pov, item.pillarSlug, item.pillarName)}
              </span>
            </div>
            <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 line-clamp-2">
              {item.title}
            </h3>
            <p className="text-xs text-stone-500 mt-2 line-clamp-2">{item.whyItMatters}</p>
          </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {items.map((item) => {
        const selected = selectedId === item.id;
        const accentHex = PILLAR_HEX[accentForPillarSlug(pov, item.pillarSlug)];
        return (
          <div
            key={item.id}
            role="button"
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(item.id);
              }
            }}
            style={selected ? { borderLeftColor: accentHex } : undefined}
            className={`px-4 ${viewMode === "compact" ? "py-2" : "py-3"} border-b border-stone-100 dark:border-stone-800/50 border-l-2 cursor-pointer transition-colors outline-none ${
              selected
                ? "bg-stone-50 dark:bg-stone-800/40"
                : "border-l-transparent hover:bg-stone-50 dark:hover:bg-stone-800/50"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {viewMode !== "compact" ? (
                <ItemThumbnail
                  url={item.url}
                  imageUrl={item.imageUrl}
                  faviconUrl={item.faviconUrl}
                  alt=""
                />
              ) : null}
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <ScoreBadge score={item.score} />
                <div className="min-w-0 flex-1">
                <h3
                  className={`leading-snug font-medium text-stone-900 dark:text-stone-100 line-clamp-2 ${
                    viewMode === "compact" ? "text-sm" : "text-[15px]"
                  }`}
                >
                  {item.title}
                </h3>
                {viewMode !== "compact" && (
                  <>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-1 flex items-center gap-1.5">
                      <ItemFavicon url={item.url} faviconUrl={item.faviconUrl} className="w-3.5 h-3.5 rounded-sm" />
                      <span>{item.source}</span>
                      <span className="w-0.5 h-0.5 rounded-full bg-stone-300 dark:bg-stone-600" />
                      <span>{item.published}</span>
                    </p>
                    <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1.5 line-clamp-2 leading-snug">
                      {item.whyItMatters}
                    </p>
                  </>
                )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 mt-2 ml-8">
              <ActionButton
                label="Good take — prefer similar framing (T)"
                active={ratings[item.id] === "up"}
                activeColor="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                onClick={() => onRate(item.id, "up")}
              >
                <ThumbsUp className="w-3.5 h-3.5" strokeWidth={1.75} />
              </ActionButton>
              <ActionButton
                label="Missed the mark — bad personal relevance line (X)"
                active={ratings[item.id] === "down"}
                activeColor="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                onClick={() => onRate(item.id, "down")}
              >
                <ThumbsDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              </ActionButton>
              <ActionButton
                label="Not interested in this topic (D)"
                active={ratings[item.id] === "dismiss"}
                onClick={() => onRate(item.id, "dismiss")}
              >
                <Ban className="w-3.5 h-3.5" strokeWidth={1.75} />
              </ActionButton>
              <ActionButton
                label={archivedView ? "Restore to inbox" : "Archive (A)"}
                onClick={() =>
                  archivedView ? onUnarchive?.(item.id) : onArchive(item.id)
                }
              >
                {archivedView ? (
                  <ArchiveRestore className="w-3.5 h-3.5" strokeWidth={1.75} />
                ) : (
                  <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
              </ActionButton>
              <Tooltip label="Open source (O)" className="ml-auto" placement="bottom">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open source"
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors inline-flex"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                </a>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}
