import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "px-3 py-1.5 text-sm font-semibold rounded-md bg-slate-700 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2",
  secondary:
    "px-3 py-1.5 text-sm font-medium rounded-md bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 dark:hover:bg-stone-800 transition-colors duration-150",
  ghost:
    "p-1.5 rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300 transition-colors duration-150",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "secondary", className = "", disabled, ...props }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${VARIANTS[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`.trim()}
      {...props}
    />
  );
}
