import { scoreHex } from "../tokens";

type Props = { score: number; max?: number; className?: string };

/** Compact score chip, tinted along the rainbow spectrum (low→violet, high→cyan/emerald). */
export function ScoreBadge({ score, max = 15, className = "" }: Props) {
  const hex = scoreHex(score, max);
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.75rem] h-5 px-1.5 text-[11px] font-bold rounded-md tabular-nums ${className}`}
      style={{ color: hex, backgroundColor: `${hex}1f`, border: `1px solid ${hex}3d` }}
    >
      {score}
    </span>
  );
}
