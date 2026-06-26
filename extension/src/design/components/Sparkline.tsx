import { useId } from "react";

type Props = {
  data: number[];
  width?: number;
  height?: number;
  /** Gradient stops for the line+area (defaults to a violet→fuchsia→amber sweep). */
  stops?: [string, string, string];
  strokeWidth?: number;
  className?: string;
  ariaLabel?: string;
};

/** Compact gradient sparkline (line + soft area fill), matches the dashboard refs. */
export function Sparkline({
  data,
  width = 120,
  height = 40,
  stops = ["#7c3aed", "#d6249f", "#f59e0b"],
  strokeWidth = 2,
  className = "",
  ariaLabel = "Trend",
}: Props) {
  const id = useId().replace(/:/g, "");
  const pad = strokeWidth + 1;

  if (data.length === 0) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden />
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const toX = (i: number) =>
    data.length === 1 ? width / 2 : pad + (i / (data.length - 1)) * plotW;
  const toY = (v: number) => pad + plotH - ((v - min) / range) * plotH;

  const points = data.map((v, i) => [toX(i), toY(v)] as const);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${toX(data.length - 1).toFixed(1)} ${(height - pad).toFixed(
    1,
  )} L ${toX(0).toFixed(1)} ${(height - pad).toFixed(1)} Z`;

  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stops[0]} />
          <stop offset="50%" stopColor={stops[1]} />
          <stop offset="100%" stopColor={stops[2]} />
        </linearGradient>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stops[1]} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stops[1]} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#area-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#line-${id})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.5} fill={stops[2]} />
    </svg>
  );
}
