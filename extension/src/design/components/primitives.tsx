import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/** Gradient wordmark / hero number. */
export function RainbowText({
  children,
  full = false,
  className = "",
}: {
  children: ReactNode;
  full?: boolean;
  className?: string;
}) {
  return (
    <span className={`${full ? "text-rainbow-full" : "text-rainbow"} ${className}`}>
      {children}
    </span>
  );
}

/** Rounded soft-shadow surface. Set `flat` for a borders-only variant. */
export function Card({
  children,
  flat = false,
  className = "",
  as: As = "div",
  ...rest
}: {
  children: ReactNode;
  flat?: boolean;
  className?: string;
  as?: "div" | "section" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={`${flat ? "card-flat" : "card"} ${className}`} {...rest}>
      {children}
    </As>
  );
}

type ButtonVariant = "primary" | "rainbow" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950 disabled:opacity-50 disabled:cursor-not-allowed select-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-stone-900 text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200",
  rainbow:
    "bg-rainbow text-white hover:brightness-110 shadow-sm shadow-fuchsia-500/20",
  secondary:
    "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-200 dark:border-stone-700 dark:hover:bg-stone-800",
  ghost:
    "text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800",
  danger:
    "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type PillTone = "neutral" | "accent" | "success" | "warn" | "danger";

const PILL_TONES: Record<PillTone, string> = {
  neutral:
    "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  accent:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** ↑/↓ percentage delta badge used on stat cards. */
export function DeltaBadge({
  value,
  suffix = "%",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        up
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      } ${className}`}
    >
      {up ? (
        <ArrowUpRight className="w-3 h-3" strokeWidth={2.25} />
      ) : (
        <ArrowDownRight className="w-3 h-3" strokeWidth={2.25} />
      )}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

type DotState = "live" | "idle" | "error" | "success";

const DOT_COLORS: Record<DotState, string> = {
  live: "bg-emerald-400",
  idle: "bg-stone-300 dark:bg-stone-600",
  error: "bg-rose-400",
  success: "bg-emerald-400",
};

export function StatusDot({
  state = "idle",
  pulse = false,
  className = "",
}: {
  state?: DotState;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex ${className}`}>
      {pulse && state === "live" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT_COLORS[state]}`} />
    </span>
  );
}
