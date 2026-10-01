import * as React from "react";
import { cn } from "@/app/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
