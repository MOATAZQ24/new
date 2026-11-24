/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { notFound } from "next/navigation";
import { DesignLabClient } from "@/components/design-lab/DesignLabClient";

export const dynamic = "force-dynamic";

export default async function DesignSystemLabPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; dir?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DESIGN_LAB !== "1") {
    notFound();
  }
  const sp = await searchParams;
  return <DesignLabClient initialTheme={sp.theme === "dark" ? "dark" : "light"} initialDir={sp.dir === "ltr" ? "ltr" : "rtl"} />;
}
