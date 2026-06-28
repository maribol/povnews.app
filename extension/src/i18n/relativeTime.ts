import type { Language } from "./languages";

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/**
 * Localized relative time ("3 hours ago", "il y a 3 heures", "3小时前") using the
 * platform Intl.RelativeTimeFormat, so we don't hand-translate time phrases.
 * Returns "" for missing/invalid input.
 */
export function formatRelativeTime(iso: string | undefined, language: Language): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  let duration = (then - Date.now()) / 1000; // seconds, negative for past

  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.round(duration), unit);
    }
    duration /= amount;
  }
  return "";
}

/** Localized absolute date, for tooltips. */
export function formatDate(iso: string | undefined, language: Language): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" });
}

/** True if the timestamp is within the last `hours` (default 24h). */
export function isRecent(iso: string | undefined, hours = 24): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < hours * 3_600_000;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Friendly day label: "Today" / "Yesterday" for the two most recent days,
 * otherwise a localized date ("July 25", and the year too if it's not the
 * current year). The Today/Yesterday words are passed in already-translated so
 * this stays a pure, non-React helper.
 */
export function dayLabel(
  iso: string | undefined,
  language: Language,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(d.getTime())) / 86_400_000);
  if (diffDays === 0) return todayLabel;
  if (diffDays === 1) return yesterdayLabel;

  const sameYear = new Date().getFullYear() === d.getFullYear();
  return d.toLocaleDateString(
    language,
    sameYear
      ? { month: "long", day: "numeric" }
      : { year: "numeric", month: "long", day: "numeric" },
  );
}

/** Stable per-day key for grouping (local time). */
export function dayKey(iso: string | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return String(startOfDay(d.getTime()));
}
