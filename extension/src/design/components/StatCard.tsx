import type { ReactNode } from "react";
import { Card } from "./primitives";
import { DeltaBadge } from "./primitives";
import { Sparkline } from "./Sparkline";

type Props = {
  label: string;
  value: ReactNode;
  delta?: number;
  data?: number[];
  footnote?: string;
  rainbow?: boolean;
  icon?: ReactNode;
  sparkStops?: [string, string, string];
  className?: string;
};

/** Dashboard stat tile: label, big value, delta pill, and a gradient sparkline. */
export function StatCard({
  label,
  value,
  delta,
  data,
  footnote,
  rainbow = false,
  icon,
  sparkStops,
  className = "",
}: Props) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {delta !== undefined && <DeltaBadge value={delta} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${
              rainbow ? "text-rainbow" : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {value}
          </div>
          {footnote && (
            <p className="mt-1.5 text-[11px] text-stone-400 dark:text-stone-500">
              {footnote}
            </p>
          )}
        </div>
        {data && data.length > 1 && (
          <Sparkline
            data={data}
            width={92}
            height={36}
            stops={sparkStops}
            className="w-[92px] h-9 shrink-0"
            ariaLabel={`${label} trend`}
          />
        )}
      </div>
    </Card>
  );
}
