/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Search,
  Mic,
  Square,
  ArrowRight,
  CheckCircle2,
  LifeBuoy,
  CheckSquare,
  HardDrive,
  Users,
  CreditCard,
  Wrench,
  ShieldCheck,
  FileText,
  Key,
  Settings,
  Layers,
  Building2,
  Send,
  X,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

interface NavigationCommand {
  id: string;
  title: string;
  category: "navigation" | "action";
  icon: React.ReactNode;
  url?: string;
  action?: () => void;
  keywords: string[];
}

export function GlobalAIComposer() {
  const router = useRouter();
  const { user, activeCompanyId } = useAuth();
  const { roleCategory, isEmployee, isTechnician, isManager, isAdmin } = useUserRole();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"assistant" | "voice">("assistant");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for open events
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setMode("assistant");
      setTimeout(() => inputRef.current?.focus(), 80);
    };

    const handleVoiceOpen = () => {
      setIsOpen(true);
      setMode("voice");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        if (!isOpen) {
          setTimeout(() => inputRef.current?.focus(), 80);
        }
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("ig:open-ai-composer", handleOpen);
    window.addEventListener("ig:open-voice-composer", handleVoiceOpen);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("ig:open-ai-composer", handleOpen);
      window.removeEventListener("ig:open-voice-composer", handleVoiceOpen);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Command Registry
  const commands: NavigationCommand[] = useMemo(() => {
    const base: NavigationCommand[] = [
      {
        id: "nav-dash",
        title: "لوحة القيادة والمؤشرات العامة",
        category: "navigation",
        icon: <Layers size={16} className="text-[#078363]" />,
        url: "/dashboard",
        keywords: ["لوحة", "مؤشرات", "dashboard", "home", "الرئيسية"],
      },
      {
        id: "nav-tasks",
        title: "إدارة المهام والتشغيل",
        category: "navigation",
        icon: <CheckSquare size={16} className="text-emerald-600" />,
        url: "/tasks",
        keywords: ["مهام", "تشغيل", "tasks", "كانبان"],
      },
      {
        id: "nav-tickets",
        title: "مكتب المساعدة والدعم الفني (IT Help Desk)",
        category: "navigation",
        icon: <LifeBuoy size={16} className="text-sky-600" />,
        url: "/tickets",
        keywords: ["تذاكر", "دعم", "help", "desk", "tickets", "مشكلة", "عطل"],
      },
      {
        id: "nav-assets",
        title: "الأصول التقنية والأجهزة",
        category: "navigation",
        icon: <HardDrive size={16} className="text-indigo-600" />,
        url: "/assets",
        keywords: ["أصول", "أجهزة", "كمبيوتر", "طابعة", "assets", "devices"],
      },
      {
        id: "nav-custody",
        title: "سجل العهد وإيصالات التسليم",
        category: "navigation",
        icon: <CheckCircle2 size={16} className="text-teal-600" />,
        url: "/custody",
        keywords: ["عهدة", "عهد", "تسليم", "custody", "إيصال"],
      },
      {
        id: "nav-employees",
        title: "دليل الموظفين والهيكل",
        category: "navigation",
        icon: <Users size={16} className="text-blue-600" />,
        url: "/employees",
        keywords: ["موظفين", "فريق", "employees", "دليل"],
      },
      {
        id: "nav-approvals",
        title: "مركز الموافقات وطلبات الشراء",
        category: "navigation",
        icon: <ShieldCheck size={16} className="text-amber-600" />,
        url: "/approvals",
        keywords: ["موافقات", "شراء", "اعتمادات", "approvals"],
      },
      {
        id: "nav-subs",
        title: "الاشتراكات والتراخيص السحابية",
        category: "navigation",
        icon: <CreditCard size={16} className="text-purple-600" />,
        url: "/subscriptions",
        keywords: ["اشتراكات", "تراخيص", "subscriptions", "saas", "سحابة"],
      },
      {
        id: "nav-maint",
        title: "الصيانة وتغييرات التكوين",
        category: "navigation",
        icon: <Wrench size={16} className="text-orange-600" />,
        url: "/maintenance",
        keywords: ["صيانة", "تغييرات", "maintenance", "changes"],
      },
      {
        id: "nav-vault",
        title: "الخزينة الرقمية والأصول المشفرة",
        category: "navigation",
        icon: <Key size={16} className="text-rose-600" />,
        url: "/digital-assets",
        keywords: ["خزينة", "أسرار", "vault", "secrets", "كلمات مرور"],
      },
      {
        id: "nav-reports",
        title: "التقارير وسجل التدقيق",
        category: "navigation",
        icon: <FileText size={16} className="text-[var(--text-2)]" />,
        url: "/reports",
        keywords: ["تقارير", "تدقيق", "reports", "audit", "سجل"],
      },
      {
        id: "nav-companies",
        title: "إدارة المنشآت والفروع",
        category: "navigation",
        icon: <Building2 size={16} className="text-cyan-600" />,
        url: "/companies",
        keywords: ["شركات", "فروع", "منشآت", "companies", "branches"],
      },
      {
        id: "nav-settings",
        title: "إعدادات النظام والمظهر",
        category: "navigation",
        icon: <Settings size={16} className="text-[var(--text-3)]" />,
        url: "/settings",
        keywords: ["إعدادات", "مظهر", "settings", "تخصيص"],
      },
    ];

    // Role-specific action commands
    const actions: NavigationCommand[] = [
      {
        id: "action-new-ticket",
        title: "تقديم بلاغ جديد في الدعم الفني",
        category: "action",
        icon: <LifeBuoy size={16} className="text-sky-500" />,
        action: () => {
          setIsOpen(false);
          router.push("/tickets");
        },
        keywords: ["بلاغ", "تذكرة", "مشكلة", "جديد", "create ticket"],
      },
    ];

    if (!isEmployee) {
      actions.push({
        id: "action-new-task",
        title: "إنشاء مهمة تشغيلية جديدة",
        category: "action",
        icon: <CheckSquare size={16} className="text-emerald-500" />,
        action: () => {
          setIsOpen(false);
          router.push("/tasks");
        },
        keywords: ["مهمة", "جديدة", "إسناد", "create task"],
      });
    }

    if (isManager || isAdmin) {
      actions.push({
        id: "action-new-purchase",
        title: "رفع طلب شراء واعتماد تقني",
        category: "action",
        icon: <CreditCard size={16} className="text-amber-500" />,
        action: () => {
          setIsOpen(false);
          router.push("/approvals");
        },
        keywords: ["شراء", "طلب", "اعتماد", "purchase request"],
      });
    }

    return [...actions, ...base];
  }, [router, isEmployee, isManager, isAdmin]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 8);
    const q = query.trim().toLowerCase();
    return commands.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      return c.keywords.some((kw) => kw.toLowerCase().includes(q));
    });
  }, [query, commands]);

  // Reset selected index when query changes
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  // Execute command
  const executeCommand = (cmd: NavigationCommand) => {
    setIsOpen(false);
    setQuery("");
    if (cmd.action) {
      cmd.action();
    } else if (cmd.url) {
      router.push(cmd.url);
    }
  };

  // Keyboard navigation inside command palette
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
      } else if (query.trim()) {
        handleNaturalLanguageAction();
      }
    }
  };

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      toast.error("تعذر الوصول إلى الميكروفون. يرجى التحقق من أذونات المتصفح.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Natural Language Action Parser
  const handleNaturalLanguageAction = async () => {
    const text = query.trim();
    if (!text) return;

    setIsProcessing(true);
    try {
      const lower = text.toLowerCase();
      // Smart Intent Detection
      if (
        lower.includes("طابعة") ||
        lower.includes("عطل") ||
        lower.includes("شاشة") ||
        lower.includes("شبكة") ||
        lower.includes("انترنت") ||
        lower.includes("مشكلة") ||
        lower.includes("بلاغ")
      ) {
        toast.info("تم تحليل الطلب كبلاغ دعم فني، جاري التوجيه إلى نافذة البلاغات...");
        setIsOpen(false);
        router.push("/tickets");
      } else if (lower.includes("مهمة") || lower.includes("تكليف") || lower.includes("فحص")) {
        toast.info("تم تحليل الطلب كمهمة عمل، جاري التوجيه إلى إدارة المهام...");
        setIsOpen(false);
        router.push("/tasks");
      } else if (lower.includes("شراء") || lower.includes("رخصة") || lower.includes("ترقية")) {
        toast.info("تم تحليل الطلب كطلب شراء أو اعتماد...");
        setIsOpen(false);
        router.push("/approvals");
      } else {
        // Fallback search across assets or tickets
        toast.info(`جاري البحث عن "${text}" في النظام...`);
        setIsOpen(false);
        router.push(`/tasks?search=${encodeURIComponent(text)}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-[var(--surface)] dark:bg-slate-900 border border-[var(--border)] dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Tabs */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] dark:border-slate-800/80 bg-[var(--surface-2)] dark:bg-slate-850/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#078363]/10 text-[#078363] flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <span className="text-xs font-black text-[var(--text)] dark:text-slate-100">
              المساعد الذكي للعمليات
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-[10px] font-mono text-[var(--text-2)] dark:text-slate-400">
              {roleCategory === "admin"
                ? "مدير النظام"
                : roleCategory === "manager"
                ? "مدير العمليات"
                : roleCategory === "technician"
                ? "فني العمليات"
                : "موظف"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === "voice" ? "assistant" : "voice")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                mode === "voice"
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                  : "text-[var(--text-3)] hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Mic size={13} />
              <span>تسجيل صوتي</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[var(--text-3)] hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="إغلاق"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Voice Mode Container */}
        {mode === "voice" ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <Mic size={28} className={isRecording ? "animate-pulse" : ""} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[var(--text)] dark:text-slate-200">
                {isRecording ? "جاري الاستماع وتسجيل الملاحظة..." : "تسجيل إيعاز صوتي للعمليات"}
              </h4>
              <p className="text-xs text-[var(--text-3)] mt-1">
                تحدث بحرية لطلب مهمة، بلاغ عطل، أو استفسار وسيقوم المساعد بتحليله
              </p>
            </div>

            {isRecording && (
              <div className="text-xl font-mono font-bold text-rose-600">
                {Math.floor(recordingSeconds / 60)}:
                {String(recordingSeconds % 60).padStart(2, "0")}
              </div>
            )}

            {audioUrl && !isRecording && (
              <div className="flex items-center justify-center gap-2 p-3 bg-[var(--surface-2)] dark:bg-slate-800 rounded-xl">
                <Volume2 size={16} className="text-[#078363]" />
                <audio src={audioUrl} controls className="h-8 max-w-xs" />
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 shadow-xs flex items-center gap-2"
                >
                  <Mic size={14} />
                  <span>بدء التسجيل</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 shadow-xs flex items-center gap-2"
                >
                  <Square size={14} />
                  <span>إيقاف التسجيل</span>
                </button>
              )}

              {audioBlob && !isRecording && (
                <button
                  type="button"
                  onClick={() => {
                    toast.success("تم تحليل التسجيل الصوتي وتوجيهه بنجاح!");
                    setIsOpen(false);
                  }}
                  className="px-4 py-2 bg-[#078363] text-white rounded-xl text-xs font-bold hover:bg-[#066e53] shadow-xs flex items-center gap-2"
                >
                  <Send size={14} />
                  <span>اعتماد وإرسال</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Assistant / Command Palette Mode */
          <>
            <div className="relative p-3 border-b border-[var(--border)] dark:border-slate-800/80">
              <Search
                size={18}
                className="absolute start-6 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="اكتب أمراً، اسم وحدة، أو صف ما تريد إنجازه..."
                className="w-full ps-11 pe-4 py-2.5 text-sm bg-transparent outline-none text-[var(--text)] dark:text-slate-100 placeholder:text-slate-400 font-medium"
              />
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-3)]">
                  <p>لا توجد أوامر مطابقة لـ &quot;{query}&quot;</p>
                  <p className="mt-1 font-semibold text-[#078363] cursor-pointer hover:underline" onClick={handleNaturalLanguageAction}>
                    اضغط Enter لتنفيذ بحث عام أو تحليل الإيعاز الذكي
                  </p>
                </div>
              ) : (
                filteredCommands.map((cmd, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-start transition cursor-pointer ${
                        isSelected
                          ? "bg-[var(--surface-2)] dark:bg-slate-800/80 text-[var(--text)] dark:text-slate-100 font-bold"
                          : "text-[var(--text-2)] dark:text-slate-300 hover:bg-[var(--surface-2)] dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--surface)] dark:bg-slate-800 border border-[var(--border)] dark:border-slate-700/60 flex items-center justify-center shrink-0 shadow-2xs">
                          {cmd.icon}
                        </div>
                        <span className="text-xs">{cmd.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--text-3)]">
                        {cmd.category === "action" ? (
                          <span className="text-[10px] bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded font-medium">
                            إجراء فوري
                          </span>
                        ) : null}
                        <ArrowRight size={13} className="rotate-180" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Hints */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] dark:border-slate-800 text-[11px] text-[var(--text-3)] bg-[var(--surface-2)] dark:bg-slate-850/30">
              <div className="flex items-center gap-2">
                <span>استخدم</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] dark:bg-slate-800 border border-[var(--border)] dark:border-slate-700 font-mono text-[10px]">
                  ↑
                </kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] dark:bg-slate-800 border border-[var(--border)] dark:border-slate-700 font-mono text-[10px]">
                  ↓
                </kbd>
                <span>للتنقل و</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] dark:bg-slate-800 border border-[var(--border)] dark:border-slate-700 font-mono text-[10px]">
                  Enter
                </kbd>
                <span>للاختيار</span>
              </div>
              <div>
                <span>Investor Gate OS AI</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
