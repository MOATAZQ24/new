"use client";

import { useEffect, useState } from "react";
import { useFeatureFlags } from "@/lib/featureFlags";
import { Activity, Cpu, Wifi } from "lucide-react";

export function PerfMonitorPill() {
  const { flags } = useFeatureFlags();
  const [latency, setLatency] = useState<number | null>(null);
  const [fps, setFps] = useState<number>(60);
  const [memoryMb, setMemoryMb] = useState<number | null>(null);

  useEffect(() => {
    if (!flags.perfMonitor) return;

    // Ping check
    const checkPing = async () => {
      const start = performance.now();
      try {
        await fetch("/api/health", { cache: "no-store" });
        const duration = Math.round(performance.now() - start);
        setLatency(duration);
      } catch {
        setLatency(null);
      }
    };

    checkPing();
    const pingInterval = setInterval(checkPing, 5000);

    // FPS Counter
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const countFrame = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;

        // Check memory if chrome performance.memory exists
        const perf = window.performance as unknown as { memory?: { usedJSHeapSize: number } };
        if (perf?.memory) {
          setMemoryMb(Math.round(perf.memory.usedJSHeapSize / (1024 * 1024)));
        }
      }
      animId = requestAnimationFrame(countFrame);
    };

    animId = requestAnimationFrame(countFrame);

    return () => {
      clearInterval(pingInterval);
      cancelAnimationFrame(animId);
    };
  }, [flags.perfMonitor]);

  if (!flags.perfMonitor) return null;

  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return "text-red-400";
    if (ms < 50) return "text-emerald-400";
    if (ms < 150) return "text-amber-400";
    return "text-red-400";
  };

  const getFpsColor = (f: number) => {
    if (f >= 55) return "text-emerald-400";
    if (f >= 30) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div
      dir="ltr"
      title="مراقب الأداء الفوري (Web Vitals & Latency)"
      className="fixed bottom-5 right-5 z-[999998] flex items-center gap-3 bg-slate-950/85 backdrop-blur-md border border-slate-800 text-slate-300 text-[11px] font-mono px-3 py-1.5 rounded-full shadow-lg pointer-events-auto select-none"
    >
      <div className="flex items-center gap-1.5">
        <Activity className={`w-3.5 h-3.5 ${getFpsColor(fps)}`} />
        <span>{fps} FPS</span>
      </div>

      <div className="w-[1px] h-3 bg-slate-800" />

      <div className="flex items-center gap-1.5">
        <Wifi className={`w-3.5 h-3.5 ${getLatencyColor(latency)}`} />
        <span>{latency !== null ? `${latency}ms` : "OFFLINE"}</span>
      </div>

      {memoryMb !== null && (
        <>
          <div className="w-[1px] h-3 bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>{memoryMb}MB</span>
          </div>
        </>
      )}
    </div>
  );
}
export default PerfMonitorPill;
