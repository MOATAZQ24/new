/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useRef, useEffect, useId } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<any>;
  position?: "top" | "bottom" | "right" | "left";
  delayMs?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = "top",
  delayMs = 200,
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipId = useId();

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
  };

  const caretClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-[#202124] dark:border-t-[#1E293B] border-x-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[#202124] dark:border-b-[#1E293B] border-x-transparent border-t-transparent",
    right: "right-full top-1/2 -translate-y-1/2 border-r-[#202124] dark:border-r-[#1E293B] border-y-transparent border-l-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-[#202124] dark:border-l-[#1E293B] border-y-transparent border-r-transparent",
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {React.cloneElement(children, {
        "aria-describedby": isVisible ? tooltipId : undefined,
      })}

      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1 text-xs font-medium text-white bg-[#202124] dark:bg-[#1E293B] border border-border/40 rounded-lg shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 ${positionClasses[position]} ${className}`}
        >
          {content}
          <div className={`absolute w-0 h-0 border-4 ${caretClasses[position]}`} />
        </div>
      )}
    </div>
  );
}

export default Tooltip;
