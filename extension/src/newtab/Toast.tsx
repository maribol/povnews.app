import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export type ToastPayload = {
  id: string;
  kind: "error" | "success" | "info";
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type Props = {
  toast: ToastPayload | null;
  onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === "error" && toast.actionLabel ? 12_000 : 6_000;
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const styles =
    toast.kind === "error"
      ? "border-rose-200 dark:border-rose-800 bg-white dark:bg-stone-900 text-rose-700 dark:text-rose-300"
      : toast.kind === "success"
        ? "border-emerald-200 dark:border-emerald-800 bg-white dark:bg-stone-900 text-emerald-700 dark:text-emerald-300"
        : "border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300";

  const Icon = toast.kind === "success" ? CheckCircle2 : AlertCircle;
  const iconColor =
    toast.kind === "error"
      ? "text-rose-500"
      : toast.kind === "success"
        ? "text-emerald-500"
        : "text-indigo-500";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[min(420px,calc(100vw-2rem))]">
      <div
        className={`rounded-xl border shadow-lg shadow-stone-900/10 dark:shadow-black/30 px-4 py-3 ${styles}`}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              {toast.title}
            </p>
            {toast.message && (
              <p className="text-xs mt-1 text-stone-500 dark:text-stone-400 leading-relaxed">
                {toast.message}
              </p>
            )}
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={toast.onAction}
                className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
