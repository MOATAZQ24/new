"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const cardVariants = cva(
  "rounded-[var(--radius-10)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  {
    variants: {
      elevation: { e0: "shadow-none", e1: "shadow-[var(--shadow-e1)]" },
      interactive: {
        true: "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-e1)] cursor-pointer",
        false: "",
      },
      padding: { none: "p-0", sm: "p-3", md: "p-4", lg: "p-6" },
    },
    defaultVariants: { elevation: "e0", interactive: false, padding: "md" },
  }
);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, interactive, padding, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ elevation, interactive, padding }), className)} {...props} />
  )
);
Card.displayName = "Card";

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 pb-3 border-b border-[var(--border)]", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[16px] font-semibold leading-[1.4] text-[var(--text)]", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-[var(--text-2)] leading-[1.5]", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-3", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 pt-3 mt-3 border-t border-[var(--border)]", className)} {...props} />;
}
