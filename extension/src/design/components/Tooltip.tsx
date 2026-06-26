import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  children: React.ReactNode;
  className?: string;
  placement?: "top" | "bottom";
};

export function Tooltip({ label, children, className, placement = "top" }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  function show(): void {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      x: rect.left + rect.width / 2,
      y: placement === "bottom" ? rect.bottom + 6 : rect.top - 6,
    });
    setVisible(true);
  }

  function hide(): void {
    setVisible(false);
  }

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-flex ${className ?? ""}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y,
              transform:
                placement === "bottom"
                  ? "translate(-50%, 0)"
                  : "translate(-50%, -100%)",
            }}
            className="pointer-events-none px-2 py-1 rounded-md bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px] leading-tight whitespace-nowrap z-[9999] shadow-md"
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
