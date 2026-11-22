"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sun,
  Moon,
  ArrowLeft,
  Compass,
  X,
  Plus,
  Layers,
  CheckCircle2,
  Sliders,
  Laptop,
  HelpCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useWorkspace } from "@/context/WorkspaceContext";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  icon?: React.ReactNode;
  action: () => void;
}

const CORE_MODULES = [
  { label: "لوحة المتابعة", sub: "Dashboard", href: "/", kw: "dashboard home رئيسية" },
  { label: "إدارة المهام والمواعيد", sub: "Tasks & Deadlines", href: "/tasks", kw: "tasks deadlines مهام" },
  { label: "الأصول والعهد التقنية", sub: "Assets & Custody", href: "/assets", kw: "assets custody أصول عهد عهدة" },
  { label: "الاشتراكات والتراخيص", sub: "Subscriptions", href: "/subscriptions", kw: "subscriptions saas اشتراكات تراخيص" },
  { label: "مكتب المساعدة (Help Desk)", sub: "Tickets & Support", href: "/tickets", kw: "tickets helpdesk تذاكر دعم بلاغ" },
  { label: "الموظفون وملفات 360°", sub: "Employees & Profiles", href: "/employees", kw: "employees staff موظفين 360" },
  { label: "الشركات والفروع", sub: "Companies & Branches", href: "/companies", kw: "companies branches شركات فروع" },
  { label: "مركز الاعتمادات والطلبات", sub: "Approvals & Requests", href: "/approvals", kw: "approvals requests موافقات طلبات" },
  { label: "التقارير والتحليلات", sub: "Reports & Analytics", href: "/reports", kw: "reports export pdf csv تقارير" },
  { label: "الإعدادات وتخصيص المظهر", sub: "Settings & Themes", href: "/settings/appearance", kw: "settings themes مظهر إعدادات" },
  { label: "مركز المعرفة والمساعدة", sub: "Knowledge & Tour", href: "/help", kw: "help guide مساعدة" },
  { label: "حول المنظومة والمطور", sub: "About & IGOS-DAPF", href: "/about", kw: "about developer licenses مطور معتز" },
];

export function CommandPalette() {
  const router = useRouter();
  const { draft, setDraft, save } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteItems, setRemoteItems] = useState<CommandItem[]>([]);
  const debounced = useDebouncedValue(query.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);

  const closePalette = () => {
    setOpen(false);
    setQuery("");
    setRemoteItems([]);
    setActiveIndex(0);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (prev) {
            setQuery("");
            setRemoteItems([]);
            setActiveIndex(0);
          }
          return !prev;
        });
      } else if (e.key === "Escape") {
        closePalette();
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("ig:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("ig:open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open || debounced.length < 2) {
      return;
    }
    let cancelled = false;
    (async () => {
      const [assetsRes, tasksRes, ticketsRes, empRes] = await Promise.allSettled([
        api.get<{ id: string; asset_code?: string; asset_name?: string; asset_type?: string }[]>(
          `/assets?search=${encodeURIComponent(debounced)}&limit=3`
        ),
        api.get<{ id: string; reference?: string; title: string }[]>(
          `/tasks?search=${encodeURIComponent(debounced)}&limit=3`
        ),
        api.get<{ id: string; ticket_number?: string; title?: string }[]>(
          `/tickets?search=${encodeURIComponent(debounced)}&limit=3`
        ),
        api.get<{ id: string; full_name: string; job_title?: string }[]>(
          `/employees?search=${encodeURIComponent(debounced)}`
        ),
      ]);
      if (cancelled) return;
      const found: CommandItem[] = [];

      // 1. Assets
      if (assetsRes.status === "fulfilled" && Array.isArray(assetsRes.value.data)) {
        for (const a of assetsRes.value.data.slice(0, 3)) {
          found.push({
            id: `cmd-asset-${a.id}`,
            label: a.asset_name || a.asset_code || "أصل",
            sublabel: a.asset_code || a.asset_type,
            group: "الأصول التقنية",
            icon: <Laptop className="w-4 h-4 text-primary" />,
            action: () => {
              setOpen(false);
              router.push("/assets");
            },
          });
        }
      }

      // 2. Tasks
      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)) {
        for (const t of tasksRes.value.data.slice(0, 3)) {
          found.push({
            id: `cmd-task-${t.id}`,
            label: t.title || t.reference || "مهمة",
            sublabel: t.reference,
            group: "المهام",
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
            action: () => {
              setOpen(false);
              router.push("/tasks");
            },
          });
        }
      }

      // 3. Tickets
      if (ticketsRes.status === "fulfilled" && Array.isArray(ticketsRes.value.data)) {
        for (const t of ticketsRes.value.data.slice(0, 3)) {
          found.push({
            id: `cmd-ticket-${t.id}`,
            label: t.title || t.ticket_number || "تذكرة",
            sublabel: t.ticket_number,
            group: "مكتب المساعدة",
            icon: <HelpCircle className="w-4 h-4 text-amber-500" />,
            action: () => {
              setOpen(false);
              router.push("/tickets");
            },
          });
        }
      }

      // 4. Employees
      if (empRes.status === "fulfilled" && Array.isArray(empRes.value.data)) {
        for (const emp of empRes.value.data.slice(0, 3)) {
          found.push({
            id: `cmd-emp-${emp.id}`,
            label: emp.full_name,
            sublabel: emp.job_title || "موظف",
            group: "الموظفون",
            action: () => {
              setOpen(false);
              router.push(`/employees/${emp.id}`);
            },
          });
        }
      }

      setRemoteItems(found);
      setActiveIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, open, router]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const isDark =
      typeof document !== "undefined" &&
      (document.documentElement.dataset.theme === "dark" ||
        document.documentElement.classList.contains("dark"));

    const quickActions: CommandItem[] = [
      {
        id: "cmd-toggle-theme",
        label: isDark ? "التبديل إلى الوضع النهاري (Light Mode)" : "التبديل إلى الوضع الليلي (Dark Mode)",
        sublabel: "Appearance",
        group: "إجراءات سريعة",
        icon: isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-primary" />,
        action: () => {
          const nextMode = isDark ? "light" : "dark";
          const next = { ...draft, appearance: { ...draft.appearance, theme: nextMode } };
          setDraft(next);
          void save(next).catch(() => {});
          setOpen(false);
        },
      },
      {
        id: "cmd-new-task",
        label: "إنشاء مهمة جديدة فورية",
        sublabel: "New Task",
        group: "إجراءات سريعة",
        icon: <Plus className="w-4 h-4 text-emerald-500" />,
        action: () => {
          setOpen(false);
          router.push("/tasks");
        },
      },
      {
        id: "cmd-new-asset",
        label: "تسجيل أصل تقني جديد في العهدة",
        sublabel: "Register Asset",
        group: "إجراءات سريعة",
        icon: <Laptop className="w-4 h-4 text-primary" />,
        action: () => {
          setOpen(false);
          router.push("/assets");
        },
      },
    ];

    const navItems: CommandItem[] = CORE_MODULES.filter(
      (m) =>
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.sub.toLowerCase().includes(q) ||
        m.kw.toLowerCase().includes(q)
    ).map((m) => ({
      id: `cmd-nav-${m.href}`,
      label: m.label,
      sublabel: m.sub,
      group: "التنقل السريع",
      icon: <Compass className="w-4 h-4 text-primary" />,
      action: () => {
        setOpen(false);
        router.push(m.href);
      },
    }));

    return [
      ...(debounced.length >= 2 ? remoteItems : []),
      ...navItems,
      ...(q ? [] : quickActions),
    ];
  }, [query, debounced, remoteItems, draft, setDraft, save, router]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4 select-none animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="لوحة الأوامر والبحث السريع"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-card text-foreground border border-border/80 shadow-2xl overflow-hidden ring-1 ring-primary/20 motion-dialog-panel"
        data-open="true"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 h-13 border-b border-border/80 bg-background/50">
          <Search className="w-4 h-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && items.length > 0) {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % items.length);
              } else if (e.key === "ArrowUp" && items.length > 0) {
                e.preventDefault();
                setActiveIndex((i) => (i - 1 + items.length) % items.length);
              } else if (e.key === "Enter" && items[activeIndex]) {
                e.preventDefault();
                items[activeIndex].action();
              }
            }}
            placeholder="اكتب أمراً، اسم صفحة، أو ابحث عن أصل، مهمة، موظف..."
            className="flex-1 bg-transparent text-xs sm:text-sm text-foreground outline-none border-0 placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border rounded">
            Esc
          </kbd>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق لوحة الأوامر"
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-84 overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              لا توجد نتائج مطابقة لبحثك
            </div>
          ) : (
            items.map((item, idx) => {
              const selected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseMove={() => setActiveIndex(idx)}
                  onClick={item.action}
                  className={`w-full px-3 py-2.5 rounded-xl text-right flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                    selected
                      ? "bg-primary/10 text-primary font-medium border border-primary/25"
                      : "hover:bg-muted/60 text-foreground border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0">
                      {item.icon || <Compass className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold truncate text-foreground">{item.label}</div>
                      {item.sublabel && (
                        <div className="text-[10px] text-muted-foreground truncate" dir="ltr">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-muted/80 border border-border/60">
                      {item.group}
                    </span>
                    {selected && <ArrowLeft className="w-3.5 h-3.5 text-primary" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-border/80 bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>استخدم <span className="font-mono font-bold text-foreground">↑</span> <span className="font-mono font-bold text-foreground">↓</span> للتنقل</span>
            <span><span className="font-mono font-bold text-foreground">Enter</span> للاختيار</span>
          </div>
          <span className="font-mono text-muted-foreground" dir="ltr">Ctrl + K / Cmd + K</span>
        </div>
      </div>
    </div>
  );
}
