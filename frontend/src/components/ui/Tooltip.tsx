"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: "top" | "bottom" | "right" | "left";
  delayMs?: number;
  className?: string;
}

export function Tooltip({ content, children, position = "top", delayMs = 200, className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayMs}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={position}
            sideOffset={6}
            className={cn(
              "z-50 rounded-[var(--radius-6)] border border-[var(--border)] bg-[var(--text)] px-2.5 py-1.5",
              "text-[12px] font-medium leading-[1.35] text-[var(--bg)] shadow-[var(--shadow-e2)] max-w-xs break-words",
              className
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
export default Tooltip;
