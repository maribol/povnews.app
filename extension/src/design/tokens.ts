import type { PillarAccent, UserPOV } from "../types/pov";

/** Spectrum stops for the rainbow gauge / progress (violet → cyan). */
export const RAINBOW_STOPS = [
  "#7c3aed",
  "#c026d3",
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
] as const;

export const PILLAR_DOT: Record<PillarAccent, string> = {
  slate: "bg-slate-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
};

export const PILLAR_ACCENT_TEXT: Record<PillarAccent, string> = {
  slate: "text-slate-600 dark:text-slate-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  violet: "text-violet-600 dark:text-violet-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
};

export const PILLAR_ACCENT_LEFT: Record<PillarAccent, string> = {
  slate: "border-l-slate-400 dark:border-l-slate-500",
  emerald: "border-l-emerald-500 dark:border-l-emerald-400",
  amber: "border-l-amber-500 dark:border-l-amber-400",
  rose: "border-l-rose-500 dark:border-l-rose-400",
  violet: "border-l-violet-500 dark:border-l-violet-400",
  cyan: "border-l-cyan-500 dark:border-l-cyan-400",
};

/** Soft tinted background chip per pillar (for badges / active rows). */
export const PILLAR_ACCENT_SOFT: Record<PillarAccent, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
};

/** Raw hex per accent — for inline SVG fills, dots, and gauges. */
export const PILLAR_HEX: Record<PillarAccent, string> = {
  slate: "#64748b",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
};

export function accentForPillarSlug(pov: UserPOV, slug: string): PillarAccent {
  return pov.pillars.find((p) => p.slug === slug)?.accent ?? "slate";
}

export function pillarHex(pov: UserPOV, slug: string): string {
  return PILLAR_HEX[accentForPillarSlug(pov, slug)];
}

export function resolvePillarName(
  pov: UserPOV,
  slug: string,
  fallback?: string,
): string {
  return pov.pillars.find((p) => p.slug === slug)?.name ?? fallback ?? slug;
}

export function scoreBadgeClass(score: number): string {
  if (score >= 12) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25";
  }
  if (score >= 9) {
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25";
  }
  return "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700";
}

/** Color for a 0–15 score on the spectrum (low=violet, high=emerald/cyan). */
export function scoreHex(score: number, max = 15): string {
  const t = Math.max(0, Math.min(1, score / max));
  const idx = Math.min(
    RAINBOW_STOPS.length - 1,
    Math.floor(t * (RAINBOW_STOPS.length - 1)),
  );
  return RAINBOW_STOPS[idx];
}
