"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/cn";

export const PopoverRoot = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "end", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn("z-50 rounded-[var(--radius-10)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] p-3 shadow-[var(--shadow-e2)] outline-none ig-scale-in transition-transform duration-[var(--dur-fast)]", className)}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

interface LegacyPopoverProps {
  trigger: React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  width?: string;
  className?: string;
}

export function Popover({ trigger, children, align = "end", side = "bottom", width = "w-72", className = "" }: LegacyPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={side} align={align} className={cn(width, "p-4 text-start", className)}>
        {children({ close: () => setOpen(false) })}
      </PopoverContent>
    </PopoverRoot>
  );
}
export default Popover;
