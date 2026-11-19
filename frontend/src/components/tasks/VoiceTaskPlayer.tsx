"use client";

import React, { useState, useEffect, useRef } from "react";

interface VoiceTaskPlayerProps {
  src: string;
  duration?: number;
  title?: string;
  className?: string;
}

export default function VoiceTaskPlayer({
  src,
  duration: initialDuration = 0,
  title,
  className = "",
}: VoiceTaskPlayerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(initialDuration);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadAudio() {
      setIsLoading(true);
      setError(null);
      try {
        const fullUrl = src.startsWith("http")
          ? src
          : src.startsWith("/")
          ? src
          : `/api/v1/tasks/voice/${src}`;

        const activeCompanyId =
          typeof window !== "undefined"
            ? localStorage.getItem("active_company_id")
            : null;

        const headers: Record<string, string> = {};
        if (activeCompanyId) {
          headers["X-Company-ID"] = activeCompanyId;
        }

        const resp = await fetch(fullUrl, {
          credentials: "include",
          headers,
        });

        if (!resp.ok) {
          if (resp.status === 403) {
            throw new Error("ليس لديك صلاحية الاستماع لهذا التسجيل الصوتي");
          } else if (resp.status === 404) {
            throw new Error("التسجيل الصوتي غير موجود أو تم حذفه");
          }
          throw new Error(`تعذر تحميل الملف الصوتي (رمز: ${resp.status})`);
        }

        const blob = await resp.blob();
        if (!active) return;

        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "تعذر تشغيل الملف الصوتي"
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadAudio();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error("Audio playback error:", err);
          setIsPlaying(false);
        });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
      setTotalDuration(Math.round(audioRef.current.duration));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div
      className={`bg-gradient-to-r from-emerald-50/80 via-white to-slate-50 border border-emerald-200/90 rounded-2xl p-3 sm:p-4 shadow-xs select-none ${className}`}
      dir="rtl"
    >
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {title && (
        <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold text-emerald-950">
          <span className="text-sm">🎙️</span>
          <span>{title}</span>
        </div>
      )}

      {error ? (
        <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Play/Pause / Loading Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل التسجيل الصوتي"}
            className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-tr from-[#123D32] to-[#187A5A] text-white flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
            ) : isPlaying ? (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 fill-current translate-x-[-1px]" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Scrubber & Waveform track */}
          <div className="flex-1 flex flex-col justify-center gap-1.5">
            <div className="relative flex items-center group">
              <input
                type="range"
                min={0}
                max={totalDuration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                disabled={isLoading}
                aria-label="شريط تقدم التسجيل الصوتي"
                className="w-full h-2 bg-emerald-100 rounded-lg appearance-none cursor-pointer accent-[#187A5A] disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(to left, #187A5A ${progressPercent}%, #e2e8f0 ${progressPercent}%)`,
                }}
              />
            </div>

            {/* Time Labels */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span className="font-semibold text-emerald-900">{formatTime(currentTime)}</span>
              <span>{formatTime(totalDuration)}</span>
            </div>
          </div>

          {/* Speed Toggle Badge */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            aria-label="تغيير سرعة التشغيل"
            className="shrink-0 px-2.5 py-1 text-xs font-bold text-[#187A5A] hover:text-[#123D32] bg-white hover:bg-emerald-100/50 rounded-lg border border-emerald-300 transition shadow-2xs cursor-pointer select-none"
          >
            {playbackRate}x
          </button>
        </div>
      )}
    </div>
  );
}
