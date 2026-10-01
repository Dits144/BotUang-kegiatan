import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "income" | "expense" | "warning" | "muted";
  children: ReactNode;
}) {
  const tones = {
    neutral:
      "border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)]",
    income:
      "border-emerald-400/25 bg-emerald-500/10 text-emerald-500",
    expense:
      "border-rose-400/25 bg-rose-500/10 text-rose-500",
    warning:
      "border-amber-400/30 bg-amber-500/10 text-amber-500",
    muted:
      "border-[var(--line)] bg-transparent text-[var(--muted)]",
  };

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-[10px] border px-2.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
