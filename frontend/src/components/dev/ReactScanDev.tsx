"use client";

import { useEffect } from "react";
import { useFeatureFlags } from "@/lib/featureFlags";

/**
 * ReactScanDev
 * Automatically activates `react-scan` in the browser when the feature flag is enabled
 * or when explicitly triggered in local development.
 */
export function ReactScanDev() {
  const { flags } = useFeatureFlags();

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (flags.reactScan) {
      import("react-scan")
        .then(({ scan }) => {
          scan({
            enabled: true,
            log: false,
          });
          console.info("[DevToolkit] React Scan monitoring is active.");
        })
        .catch((err) => {
          console.warn("[DevToolkit] Failed to load react-scan:", err);
        });
    }
  }, [flags.reactScan]);

  return null;
}
export default ReactScanDev;
