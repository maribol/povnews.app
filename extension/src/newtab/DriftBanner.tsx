import { AlertTriangle } from "lucide-react";
import type { PillarDriftAlert } from "../types/pov";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  alerts: PillarDriftAlert[];
  onDismiss: () => void;
  onEditPov: () => void;
};

export function DriftBanner({ alerts, onDismiss, onEditPov }: Props) {
  const { t } = useTranslation();
  if (alerts.length === 0) return null;
  const first = alerts[0];
  const pct = Math.round(first.downRate * 100);

  return (
    <div className="px-5 py-2.5 border-b border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 flex items-center gap-3 text-sm">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <span className="flex-1 text-stone-600 dark:text-stone-400">
        {t("drift.summary", { pct, pillarName: first.pillarName, days: first.days })}
      </span>
      <button
        type="button"
        onClick={onEditPov}
        className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
      >
        {t("drift.editPov")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
      >
        {t("drift.dismiss")}
      </button>
    </div>
  );
}
