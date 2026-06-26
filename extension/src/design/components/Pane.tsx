import type { ReactNode } from "react";

type Props = { children: ReactNode; className?: string };

export function Pane({ children, className = "" }: Props) {
  return (
    <section
      className={`flex flex-col min-h-0 bg-stone-50 dark:bg-stone-950 ${className}`}
    >
      {children}
    </section>
  );
}
