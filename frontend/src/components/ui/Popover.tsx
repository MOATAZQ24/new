/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useRef, useEffect, useId } from "react";

interface PopoverProps {
  trigger: React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  width?: string;
  className?: string;
}

export function Popover({
  trigger,
  children,
  align = "end",
  side = "bottom",
  width = "w-72",
  className = "",
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
    <div ref={containerRef} className="relative inline-flex">
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen((prev) => !prev)}
        className="cursor-pointer inline-flex items-center"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="true"
          className={`absolute z-50 ${sideClasses[side]} ${alignClasses[align]} ${width} bg-card text-card-foreground border border-border/80 rounded-2xl p-4 shadow-xl text-right animate-in fade-in zoom-in-95 duration-150 ${className}`}
        >
          {children({ close: () => setIsOpen(false) })}
        </div>
      )}
    </div>
  );
}

export default Popover;
