"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React from "react";
import { cn } from "@/lib/cn";

export interface DomainIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  className: cn("shrink-0", className),
});

export function AssetIcon({ size = 20, className, ...props }: DomainIconProps) {
  return (
    <svg {...baseProps(size, className)} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4M7 8h4" />
      <circle cx="16.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CustodyIcon({ size = 20, className, ...props }: DomainIconProps) {
  return (
    <svg {...baseProps(size, className)} {...props}>
      <path d="M6 3h9l4 4v14H6V3zM15 3v4h4M9.5 13.5l2 2 4-4M9 18h6" />
    </svg>
  );
}

export function SwitchIcon({ size = 20, className, ...props }: DomainIconProps) {
  return (
    <svg {...baseProps(size, className)} {...props}>
      <rect x="2.5" y="7" width="19" height="10" rx="2" />
      <path d="M6 12h1.5M9.5 12H11M13 12h1.5M7 4v3M17 4v3" />
      <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FirewallIcon({ size = 20, className, ...props }: DomainIconProps) {
  return (
    <svg {...baseProps(size, className)} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M3 14.5h18M9 5v5M15 5v5M12 10v4.5M9 14.5V19M15 14.5V19" />
    </svg>
  );
}

export function VlanIcon({ size = 20, className, ...props }: DomainIconProps) {
  return (
    <svg {...baseProps(size, className)} {...props}>
      <rect x="3" y="3.5" width="7" height="6" rx="1.5" />
      <rect x="14" y="3.5" width="7" height="6" rx="1.5" />
      <rect x="8.5" y="14.5" width="7" height="6" rx="1.5" />
      <path d="M6.5 9.5v2.5h11V9.5M12 12v2.5" />
    </svg>
  );
}

export function VaultIcon({ size = 20, className, ...props }: DomainIconProps) {
  return (
    <svg {...baseProps(size, className)} {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5V7M12 17v-1.5M8.5 12H7M17 12h-1.5M6.5 20v1.5M17.5 20v1.5" />
    </svg>
  );
}

export function DirectionalIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center justify-center rtl:-scale-x-100", className)}>{children}</span>;
}
