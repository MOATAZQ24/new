"use client";

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
