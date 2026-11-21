/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, X, Edit2 } from "lucide-react";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
}

export function InlineEdit({
  value,
  onSave,
  placeholder = "انقر للتعديل...",
  className = "",
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (currentValue.trim() === value) {
      setIsEditing(false);
      return;
    }
    try {
      setIsSaving(true);
      await onSave(currentValue.trim());
      setIsEditing(false);
    } catch {
      // Keep in edit mode on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={currentValue}
          disabled={isSaving}
          onChange={(e) => setCurrentValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="px-2.5 py-1 text-xs rounded-lg bg-background border border-primary text-foreground outline-none shadow-xs font-medium"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentValue(value);
            setIsEditing(false);
          }}
          disabled={isSaving}
          className="p-1 rounded-md text-rose-600 hover:bg-rose-500/10 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => e.key === "Enter" && setIsEditing(true)}
      className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-muted/60 transition cursor-pointer text-right ${className}`}
    >
      <span className="text-xs font-semibold text-foreground">
        {value || placeholder}
      </span>
      <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export default InlineEdit;
