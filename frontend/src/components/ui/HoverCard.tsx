/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useRef, useEffect, useId } from "react";

interface HoverCardProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function HoverCard({
  trigger,
  children,
  width = "w-80",
  side = "bottom",
  align = "center",
  openDelay = 200,
  closeDelay = 250,
  className = "",
}: HoverCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const openTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cardId = useId();

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, openDelay);
  };

  const handleMouseLeave = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, closeDelay);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const sideClasses = {
    top: "bottom-full mb-2",
    bottom: "top-full mt-2",
    left: "right-full mr-2",
    right: "left-full ml-2",
  };

  const alignClasses = {
    start: "right-0",
    center: "left-1/2 -translate-x-1/2",
    end: "left-0",
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? cardId : undefined}
        onClick={() => setIsOpen((prev) => !prev)}
        className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          id={cardId}
          role="dialog"
          aria-label="معاينة تفاعلية"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`absolute z-50 ${sideClasses[side]} ${alignClasses[align]} ${width} bg-card text-card-foreground border border-border/80 rounded-2xl p-4 shadow-xl text-right animate-in fade-in zoom-in-95 duration-150 ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default HoverCard;
