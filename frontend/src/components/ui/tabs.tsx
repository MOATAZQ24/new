"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: "underline" | "pill" }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 max-w-full overflow-x-auto",
      variant === "underline"
        ? "border-b border-[var(--border)] w-full gap-4"
        : "rounded-[var(--radius-6)] bg-[var(--surface-2)] p-1 border border-[var(--border)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { variant?: "underline" | "pill" }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[14px] font-medium cursor-pointer select-none",
      "transition-[color,border-color,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50 disabled:pointer-events-none",
      variant === "underline"
        ? "relative pb-2.5 pt-1 text-[var(--text-2)] hover:text-[var(--text)] border-b-2 border-transparent data-[state=active]:text-[var(--primary-text)] data-[state=active]:border-[var(--primary)]"
        : "rounded-[5px] px-3 py-1.5 text-[13px] text-[var(--text-2)] hover:text-[var(--text)] data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--primary-text)] data-[state=active]:shadow-[var(--shadow-e1)]",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("pt-4 focus-visible:outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";
