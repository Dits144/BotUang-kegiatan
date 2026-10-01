"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/app/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({
  className,
  ...props
}: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-9 rounded-[10px] px-3 text-sm font-semibold text-[var(--muted)] transition data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400",
        className,
      )}
      {...props}
    />
  );
}
