import { useEffect, type RefObject } from "react";

const SHORTCUT_KEYS = new Set(["t", "T", "x", "X", "o", "O"]);

export function useTypeToSearch(
  searchRef: RefObject<HTMLInputElement | null>,
  onQueryChange: (updater: (prev: string) => string) => void,
  onClear: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape") {
        onClear();
        searchRef.current?.blur();
        return;
      }

      if (e.key.startsWith("Arrow")) return;
      if ((e.key === "s" || e.key === "S") && e.shiftKey) return;
      if (SHORTCUT_KEYS.has(e.key)) return;
      if (e.key.length !== 1) return;

      e.preventDefault();
      onQueryChange((prev) => prev + e.key);
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchRef, onQueryChange, onClear, enabled]);
}
