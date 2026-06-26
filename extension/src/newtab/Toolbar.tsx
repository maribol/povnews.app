import { Download, LayoutGrid, List, Rows3 } from "lucide-react";
import type { ViewMode } from "../types/pov";
import { Tooltip } from "../design/components/Tooltip";

type Props = {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onExport: () => void;
};

const SHORTCUTS: [string, string][] = [
  ["↑↓", "navigate"],
  ["←→", "back / expand"],
  ["⇧S", "share"],
  ["T", "like"],
  ["X", "archive"],
  ["O", "open"],
];

export function Toolbar({ viewMode, onViewModeChange, onExport }: Props) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-stone-200/70 dark:border-stone-800/70 bg-white/70 dark:bg-stone-900/70 backdrop-blur-sm">
      <div className="flex-1 flex items-center gap-2.5 overflow-hidden">
        {SHORTCUTS.map(([key, label]) => (
          <span
            key={key}
            className="hidden sm:inline-flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500 whitespace-nowrap"
          >
            <kbd className="rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-1 py-px font-sans text-[10px] font-semibold text-stone-500 dark:text-stone-400">
              {key}
            </kbd>
            {label}
          </span>
        ))}
        <span className="text-[11px] text-stone-400 dark:text-stone-500 whitespace-nowrap">
          or just type to search
        </span>
      </div>

      <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
        {(
          [
            ["list", List, "List view"],
            ["compact", Rows3, "Compact view"],
            ["grid", LayoutGrid, "Grid view"],
          ] as const
        ).map(([mode, Icon, label]) => (
          <Tooltip key={mode} label={label} placement="bottom">
            <button
              type="button"
              aria-label={label}
              onClick={() => onViewModeChange(mode)}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === mode
                  ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm"
                  : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </Tooltip>
        ))}
      </div>
      <Tooltip label="Export as Markdown" placement="bottom">
        <button
          type="button"
          aria-label="Export markdown"
          onClick={onExport}
          className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <Download className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </Tooltip>
    </div>
  );
}
