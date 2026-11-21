"use client";

import { useState, useEffect } from "react";

export interface FeatureFlags {
  visualEditing: boolean;    // Live DOM inspector & class editor (React Grab)
  reactScan: boolean;        // Highlight rendering performance in real-time
  mswMocking: boolean;       // Mock Service Worker for offline / isolated testing
  perfMonitor: boolean;      // Floating Web Vitals & latency metrics pill
  densitySelector: boolean;  // UI density toggle (compact/comfortable/spacious)
}

const DEFAULT_FLAGS: FeatureFlags = {
  visualEditing: process.env.NODE_ENV === "development",
  reactScan: false,
  mswMocking: false,
  perfMonitor: process.env.NODE_ENV === "development",
  densitySelector: true,
};

const STORAGE_KEY = "investor_gate_feature_flags";

export function getStoredFeatureFlags(): FeatureFlags {
  if (typeof window === "undefined") return DEFAULT_FLAGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FLAGS;
    return { ...DEFAULT_FLAGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function setStoredFeatureFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): FeatureFlags {
  if (typeof window === "undefined") return DEFAULT_FLAGS;
  try {
    const current = getStoredFeatureFlags();
    const updated = { ...current, [key]: value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("investorgate:flags-updated", { detail: updated }));
    return updated;
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    setFlags(getStoredFeatureFlags());

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<FeatureFlags>;
      if (customEvent.detail) {
        setFlags(customEvent.detail);
      }
    };

    window.addEventListener("investorgate:flags-updated", handleUpdate);
    return () => window.removeEventListener("investorgate:flags-updated", handleUpdate);
  }, []);

  const toggleFlag = (key: keyof FeatureFlags) => {
    setStoredFeatureFlag(key, !flags[key]);
  };

  return { flags, toggleFlag };
}
