"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import dynamic from "next/dynamic";

const VisualEditorGrabber = dynamic(
  () => import("./VisualEditorGrabber").then((mod) => mod.VisualEditorGrabber),
  { ssr: false }
);

const ReactScanDev = dynamic(
  () => import("./ReactScanDev").then((mod) => mod.ReactScanDev),
  { ssr: false }
);

const MswInit = dynamic(
  () => import("./MswInit").then((mod) => mod.MswInit),
  { ssr: false }
);

const PerfMonitorPill = dynamic(
  () => import("./PerfMonitorPill").then((mod) => mod.PerfMonitorPill),
  { ssr: false }
);

export function DevToolkitLoader() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <>
      <VisualEditorGrabber />
      <ReactScanDev />
      <MswInit />
      <PerfMonitorPill />
    </>
  );
}
export default DevToolkitLoader;
