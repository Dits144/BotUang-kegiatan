"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/app/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl focus:outline-none md:inset-y-4 md:left-auto md:right-4 md:w-[420px] md:rounded-2xl",
          className,
        )}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-zinc-300 dark:bg-white/15 md:hidden" />
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-[10px] p-2 text-[var(--muted)] transition hover:bg-[var(--panel)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
