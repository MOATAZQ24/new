"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { PopoverRoot, PopoverTrigger, PopoverContent } from "./Popover";
import { Avatar, type AvailabilityStatus } from "./avatar";
import { CapacityBar } from "./progress";

export interface ComboboxOption {
  value: string;
  label: string;
  subtitle?: string;
  group?: string;
  availability?: AvailabilityStatus;
  openItems?: number;
  maxItems?: number;
  skills?: string[];
  disabled?: boolean;
  disabledReason?: string;
  allowOverride?: boolean;
}

export interface ComboboxQuickAction {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

export interface ComboboxProps {
  value?: string | null;
  onChange: (value: string, meta?: { override?: boolean }) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  ariaLabel: string;
  quickActions?: ComboboxQuickAction[];
  triggerClassName?: string;
  popoverWidthClassName?: string;
  disabled?: boolean;
}

export function Combobox({
  value, onChange, options, placeholder = "اختر...", searchPlaceholder = "بحث...",
  emptyLabel = "لا توجد نتائج مطابقة", ariaLabel, quickActions = [], triggerClassName,
  popoverWidthClassName = "w-80", disabled = false,
}: ComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.subtitle && o.subtitle.toLowerCase().includes(q)) ||
      (o.group && o.group.toLowerCase().includes(q)) ||
      (o.skills && o.skills.some((s) => s.toLowerCase().includes(q)))
    );
  }, [options, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ComboboxOption[]>();
    for (const opt of filtered) {
      const g = opt.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const commit = (opt: ComboboxOption) => {
    if (opt.disabled && !opt.allowOverride) return;
    onChange(opt.value, { override: Boolean(opt.disabled && opt.allowOverride) });
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) commit(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "inline-flex h-9 items-center justify-between gap-2 rounded-[var(--radius-6)]",
            "border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)]",
            "hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            "disabled:opacity-50 disabled:pointer-events-none cursor-pointer transition-colors duration-[var(--dur-fast)]",
            triggerClassName
          )}
        >
          <span className="inline-flex items-center gap-2 min-w-0 truncate">
            {selected ? (
              <>
                <Avatar name={selected.label} size="xs" availability={selected.availability} />
                <span className="truncate font-medium">{selected.label}</span>
              </>
            ) : (
              <span className="text-[var(--text-3)] truncate">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--icon-muted)]" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-0 overflow-hidden", popoverWidthClassName)}>
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--icon-muted)]" strokeWidth={1.5} aria-hidden="true" />
          <input
            type="text" value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder} aria-label={searchPlaceholder} dir="auto" autoFocus
            className="w-full bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
          />
        </div>
        {quickActions.length > 0 && !query.trim() && (
          <div className="border-b border-[var(--border)] p-1.5 space-y-0.5">
            {quickActions.map((qa) => (
              <button key={qa.id} type="button" onClick={() => { qa.onSelect(); setOpen(false); }} className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-6)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--primary-text)] hover:bg-[var(--primary-soft)] cursor-pointer transition-colors">
                <span className="inline-flex items-center gap-2">{qa.icon}<span>{qa.label}</span></span>
                {qa.shortcut && <kbd className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-2)]">{qa.shortcut}</kbd>}
              </button>
            ))}
          </div>
        )}
        <div id={listboxId} role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto p-1.5 space-y-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--text-3)]">{emptyLabel}</p>
          ) : (
            grouped.map(([groupName, items]) => (
              <div key={groupName || "__default"} className="space-y-0.5">
                {groupName && <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--text-3)]">{groupName}</div>}
                {items.map((opt) => {
                  const idx = filtered.indexOf(opt);
                  const isSelected = opt.value === value;
                  const blocked = opt.disabled && !opt.allowOverride;
                  return (
                    <button
                      key={opt.value} type="button" role="option" aria-selected={isSelected} aria-disabled={blocked || undefined}
                      onMouseEnter={() => setActiveIndex(idx)} onClick={() => commit(opt)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 rounded-[var(--radius-6)] px-2.5 py-2 text-start transition-colors",
                        blocked ? "opacity-55 cursor-not-allowed" : "cursor-pointer",
                        idx === activeIndex && !blocked ? "bg-[var(--surface-2)]" : "",
                        isSelected && "bg-[var(--primary-soft)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={opt.label} size="xs" availability={opt.availability} />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-[var(--text)]">{opt.label}</div>
                            {opt.subtitle && <div className="truncate text-[11px] text-[var(--text-3)]">{opt.subtitle}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {typeof opt.openItems === "number" && typeof opt.maxItems === "number" && <CapacityBar current={opt.openItems} max={opt.maxItems} compact />}
                          {isSelected && <Check className="h-4 w-4 text-[var(--primary-text)]" strokeWidth={1.5} aria-hidden="true" />}
                        </div>
                      </div>
                      {((opt.skills && opt.skills.length > 0) || opt.disabledReason) && (
                        <div className="flex flex-wrap items-center gap-1 ps-8">
                          {opt.skills?.slice(0, 3).map((skill) => (
                            <span key={skill} className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-1.5 py-0.25 text-[11px] text-[var(--text-2)]">{skill}</span>
                          ))}
                          {opt.disabledReason && (
                            <span className="text-[11px] font-medium text-[var(--warning-text)]">
                              {opt.disabledReason}{opt.allowOverride ? " · تجاوز مسموح" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
