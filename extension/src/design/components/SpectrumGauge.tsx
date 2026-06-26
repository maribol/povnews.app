import { RAINBOW_STOPS } from "../tokens";

type Props = {
  /** 0..1 fill fraction. */
  value: number;
  size?: number;
  ticks?: number;
  label?: string;
  sublabel?: string;
  className?: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Color along the rainbow spectrum at fraction t (0..1). */
function spectrumColor(t: number): string {
  const stops = RAINBOW_STOPS;
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - i;
  const [r1, g1, b1] = hexToRgb(stops[i]);
  const [r2, g2, b2] = hexToRgb(stops[i + 1]);
  return `rgb(${lerp(r1, r2, frac)}, ${lerp(g1, g2, frac)}, ${lerp(b1, b2, frac)})`;
}

/**
 * Radial spectrum gauge — the fan of colored ticks from the reference design.
 * Filled ticks sweep through the rainbow; the remainder is muted.
 */
export function SpectrumGauge({
  value,
  size = 220,
  ticks = 22,
  label,
  sublabel,
  className = "",
}: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const w = size;
  const h = size / 2 + 18;
  const cx = w / 2;
  const cy = size / 2 + 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter - size * 0.11;

  const filledCount = Math.round(clamped * ticks);

  const bars = Array.from({ length: ticks }, (_, i) => {
    const frac = ticks === 1 ? 0 : i / (ticks - 1);
    const angle = Math.PI - frac * Math.PI; // 180° → 0°
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x1 = cx + rInner * cos;
    const y1 = cy - rInner * sin;
    const x2 = cx + rOuter * cos;
    const y2 = cy - rOuter * sin;
    const filled = i < filledCount;
    return { x1, y1, x2, y2, filled, color: spectrumColor(frac) };
  });

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={label ? `${label}: ${Math.round(clamped * 100)}%` : "Gauge"}
      >
        {bars.map((b, i) => (
          <line
            key={i}
            x1={b.x1}
            y1={b.y1}
            x2={b.x2}
            y2={b.y2}
            stroke={b.filled ? b.color : "currentColor"}
            className={b.filled ? "" : "text-stone-200 dark:text-stone-700"}
            strokeWidth={size * 0.028}
            strokeLinecap="round"
          />
        ))}
        {(label || sublabel) && (
          <g>
            {label && (
              <text
                x={cx}
                y={cy - size * 0.06}
                textAnchor="middle"
                className="fill-stone-900 dark:fill-stone-100"
                style={{ fontSize: size * 0.16, fontWeight: 700 }}
              >
                {label}
              </text>
            )}
            {sublabel && (
              <text
                x={cx}
                y={cy - (label ? 0 : size * 0.04)}
                textAnchor="middle"
                className="fill-stone-400 dark:fill-stone-500"
                style={{ fontSize: size * 0.058, fontWeight: 500 }}
              >
                {sublabel}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
