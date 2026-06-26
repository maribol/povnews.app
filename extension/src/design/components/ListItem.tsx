import type { ReactNode } from "react";

type Props = {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
};

export function ListItem({ selected, onClick, children, className = "" }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-selected={selected ? "true" : "false"}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`px-4 py-3 border-b border-stone-100 dark:border-stone-900 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-800 data-[selected=true]:bg-stone-200 dark:data-[selected=true]:bg-stone-800 data-[selected=true]:border-l-2 data-[selected=true]:border-slate-700 transition-colors duration-150 ${className}`}
    >
      {children}
    </div>
  );
}
