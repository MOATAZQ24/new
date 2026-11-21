"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import { useEffect } from "react";
import { useFeatureFlags } from "@/lib/featureFlags";

export function MswInit() {
  const { flags } = useFeatureFlags();

  useEffect(() => {
    if (typeof window === "undefined" || !flags.mswMocking) return;

    import("@/mocks/browser")
      .then(({ worker }) => {
        if (worker) {
          (worker as any).start?.();
          console.info("[DevToolkit] MSW Mock Service Worker started.");
        }
      })
      .catch((err) => {
        console.warn("[DevToolkit] Failed to initialize MSW:", err);
      });
  }, [flags.mswMocking]);

  return null;
}
export default MswInit;
