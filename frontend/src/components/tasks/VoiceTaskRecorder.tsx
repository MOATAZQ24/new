"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

export interface VoiceRecordingResult {
  blob: Blob;
  duration: number;
  voiceNoteUrl?: string;
  previewUrl: string;
}

interface VoiceTaskRecorderProps {
  onRecordingComplete: (result: VoiceRecordingResult | null) => void;
  disabled?: boolean;
  className?: string;
}

export default function VoiceTaskRecorder({
  onRecordingComplete,
  disabled = false,
  className = "",
}: VoiceTaskRecorderProps) {
  const [recordState, setRecordState] = useState<
    "idle" | "requesting" | "recording" | "paused" | "recorded" | "uploading"
  >("idle");

  const [seconds, setSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  // Stop & clear all stream tracks
  const stopTracks = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  }, []);

  // Clear timers
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [clearTimer, stopTracks, previewUrl]);

  // Determine best supported audio mime type
  const getSupportedMimeType = (): string => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  };

  const startRecording = async () => {
    setErrorMessage(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("المتصفح الحالي لا يدعم تسجيل الصوت عبر الميكروفون.");
      return;
    }

    try {
      setRecordState("requesting");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stopTracks();
        clearTimer();

        const actualMime = recorder.mimeType || "audio/webm";
        const finalBlob = new Blob(audioChunksRef.current, { type: actualMime });
        recordedBlobRef.current = finalBlob;

        const objUrl = URL.createObjectURL(finalBlob);
        setPreviewUrl(objUrl);
        setRecordState("recorded");

        // Pass back to parent
        setSeconds((prevSeconds) => {
          const finalDuration = Math.max(1, prevSeconds);
          onRecordingComplete({
            blob: finalBlob,
            duration: finalDuration,
            previewUrl: objUrl,
          });
          return finalDuration;
        });
      };

      recorder.start(250); // Slice data every 250ms for reliability
      setSeconds(0);
      setRecordState("recording");

      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev >= 299) {
            // Reached 300 seconds (5 minutes max) -> auto-stop
            stopRecording();
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      stopTracks();
      clearTimer();
      setRecordState("idle");

      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setErrorMessage(
            "تم رفض الإذن للوصول إلى الميكروفون. يرجى تفعيل صلاحية الميكروفون من إعدادات المتصفح."
          );
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setErrorMessage("لم يتم العثور على جهاز ميكروفون متصل بالجهاز.");
        } else {
          setErrorMessage(`فشل تشغيل الميكروفون: ${err.message}`);
        }
      } else {
        setErrorMessage("تعذر بدء التسجيل الصوتي.");
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordState === "recording") {
      mediaRecorderRef.current.pause();
      clearTimer();
      setRecordState("paused");
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && recordState === "paused") {
      mediaRecorderRef.current.resume();
      setRecordState("recording");
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev >= 299) {
            stopRecording();
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      (recordState === "recording" || recordState === "paused")
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Fallback cleanup
        stopTracks();
        clearTimer();
      }
    }
  };

  const resetRecording = () => {
    stopTracks();
    clearTimer();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewPlaying(false);
    setPreviewProgress(0);
    setSeconds(0);
    recordedBlobRef.current = null;
    setRecordState("idle");
    setErrorMessage(null);
    onRecordingComplete(null);
  };

  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (previewPlaying) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
    } else {
      previewAudioRef.current
        .play()
        .then(() => setPreviewPlaying(true))
        .catch(() => setPreviewPlaying(false));
    }
  };

  const formatSeconds = (s: number) => {
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <div
      className={`border rounded-2xl p-4 bg-slate-50/70 border-slate-200 transition-all ${className}`}
      dir="rtl"
    >
      {previewUrl && (
        <audio
          ref={previewAudioRef}
          src={previewUrl}
          onTimeUpdate={() => {
            if (previewAudioRef.current) {
              const cur = previewAudioRef.current.currentTime;
              const dur = previewAudioRef.current.duration || seconds || 1;
              setPreviewProgress((cur / dur) * 100);
            }
          }}
          onEnded={() => {
            setPreviewPlaying(false);
            setPreviewProgress(0);
          }}
        />
      )}

      {errorMessage && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
          <span className="font-bold shrink-0">⚠️ تنبيه:</span>
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {recordState === "idle" && (
        <div className="flex flex-col items-center justify-center py-5 text-center gap-3">
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            aria-label="بدء تسجيل مهمة صوتية"
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#123D32] to-[#187A5A] text-white flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <svg
              className="w-7 h-7 fill-current group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
          <div className="space-y-1">
            <span className="block text-sm font-bold text-gray-800">
              اضغط لبدء تسجيل المهمة الصوتية 🎙️
            </span>
            <span className="block text-xs text-gray-500">
              يمكنك تسجيل تعليمات المهمة مباشرة بصوتك كرسالة صوتية (الحد الأقصى: 5 دقائق)
            </span>
          </div>
        </div>
      )}

      {recordState === "requesting" && (
        <div className="flex items-center justify-center py-6 gap-3 text-slate-600">
          <svg className="animate-spin h-5 w-5 text-[#187A5A]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span className="text-xs font-semibold">جاري طلب إذن الميكروفون...</span>
        </div>
      )}

      {(recordState === "recording" || recordState === "paused") && (
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-emerald-200 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                {recordState === "recording" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    recordState === "recording" ? "bg-rose-500" : "bg-amber-400"
                  }`}
                ></span>
              </span>

              <span className="text-xs font-bold text-gray-700">
                {recordState === "recording" ? "جاري التسجيل..." : "التسجيل متوقف مؤقتاً"}
              </span>
            </div>

            {/* Timer Counter */}
            <span className="font-mono text-sm font-bold text-[#123D32]">
              {formatSeconds(seconds)} / 5:00
            </span>
          </div>

          {/* Controls: Pause/Resume, Stop & Complete, Cancel */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={resetRecording}
              className="motion-control px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition cursor-pointer flex items-center gap-1"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              إلغاء وحذف
            </button>

            <div className="flex items-center gap-2">
              {recordState === "recording" ? (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="motion-control px-3.5 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                  إيقاف مؤقت
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="motion-control px-3.5 py-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  استئناف التسجيل
                </button>
              )}

              <button
                type="button"
                onClick={stopRecording}
                className="motion-control px-4 py-1.5 text-xs bg-[#187A5A] hover:bg-[#123D32] text-white rounded-lg font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                إنهاء التسجيل ومعاينته
              </button>
            </div>
          </div>
        </div>
      )}

      {recordState === "recorded" && (
        <div className="flex flex-col gap-3 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
              <span>✅</span>
              <span>تم تسجيل الرسالة الصوتية بنجاح</span>
            </span>
            <span className="font-mono text-xs font-bold text-[#187A5A]">
              المدة: {formatSeconds(seconds)}
            </span>
          </div>

          {/* Interactive Preview Bar */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-200">
            <button
              type="button"
              onClick={togglePreviewPlay}
              aria-label={previewPlaying ? "إيقاف مؤقت للمعاينة" : "تشغيل المعاينة"}
              className="w-10 h-10 rounded-full bg-[#187A5A] text-white flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-2xs shrink-0 cursor-pointer"
            >
              {previewPlaying ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current translate-x-[-1px]" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <div className="flex-1 flex flex-col gap-1">
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#187A5A] h-full transition-all duration-100"
                  style={{ width: `${previewProgress}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                <span>{previewPlaying ? "جاري الاستماع للمعاينة..." : "جاهز للإرسال"}</span>
                <span>{formatSeconds(seconds)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={resetRecording}
              title="إعادة التسجيل"
              className="px-2.5 py-1 text-xs text-gray-600 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 rounded-lg transition cursor-pointer flex items-center gap-1 shrink-0 font-medium"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              إعادة التسجيل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
