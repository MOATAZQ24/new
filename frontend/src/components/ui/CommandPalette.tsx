"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sun, ArrowLeft, Compass, X } from "lucide-react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useWorkspace } from "@/context/WorkspaceContext";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  action: () => void;
}

const CORE_MODULES = [
  { label: "لوحة المتابعة", sub: "Dashboard", href: "/", kw: "dashboard home رئيسية" },
  { label: "الشركات والفروع", sub: "Companies & Branches", href: "/companies", kw: "companies branches شركات فروع" },
  { label: "الموظفون", sub: "Employees & 360°", href: "/employees", kw: "employees staff موظفين" },
  { label: "الأصول والعهد", sub: "Assets & Custody", href: "/assets", kw: "assets custody أصول عهد" },
  { label: "الاشتراكات والتراخيص", sub: "Subscriptions", href: "/subscriptions", kw: "subscriptions saas اشتراكات" },
  { label: "مركز الاعتمادات والطلبات", sub: "Approval Center & Requests", href: "/approvals", kw: "approvals requests purchase اعتمادات موافقات شراء طلبات" },
  { label: "مكتب المساعدة (Help Desk)", sub: "Tickets", href: "/tickets", kw: "tickets helpdesk تذاكر دعم" },
  { label: "المهام والمواعيد", sub: "Tasks & Deadlines", href: "/tasks", kw: "tasks deadlines مهام" },
  { label: "التقارير والتصدير", sub: "Reports", href: "/reports", kw: "reports export pdf csv تقارير" },
  { label: "الإعدادات والهويات البصرية", sub: "Settings & Themes", href: "/settings", kw: "settings themes إعدادات سمات" },
  { label: "مركز المساعدة والتعلّم", sub: "Learning Center", href: "/help", kw: "help guide tour مساعدة تعلم" },
  { label: "حول النظام والمطور", sub: "About & Licenses", href: "/about", kw: "about developer licenses مطور تراخيص" },
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
      const [assetsRes, ticketsRes, empRes] = await Promise.allSettled([
        api.get<{ id: string; asset_tag?: string; model?: string; asset_type?: string }[]>(
          `/assets?search=${encodeURIComponent(debounced)}&limit=3`
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
      if (assetsRes.status === "fulfilled" && Array.isArray(assetsRes.value.data)) {
        for (const a of assetsRes.value.data.slice(0, 3)) {
          found.push({
            id: `cmd-asset-${a.id}`,
            label: a.model || a.asset_tag || "أصل",
            sublabel: a.asset_tag || a.asset_type,
            group: "الأصول",
            action: () => {
              setOpen(false);
              router.push("/assets");
            },
          });
        }
      }
      if (ticketsRes.status === "fulfilled" && Array.isArray(ticketsRes.value.data)) {
        for (const t of ticketsRes.value.data.slice(0, 3)) {
          found.push({
            id: `cmd-ticket-${t.id}`,
            label: t.title || t.ticket_number || "تذكرة",
            sublabel: t.ticket_number,
            group: "التذاكر",
            action: () => {
              setOpen(false);
              router.push("/tickets");
            },
          });
        }
      }
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
      typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

    const quickActions: CommandItem[] = [
      {
        id: "cmd-toggle-theme",
        label: isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن",
        sublabel: "Appearance Mode",
        group: "إجراءات سريعة",
        action: () => {
          const nextMode = isDark ? "light" : "dark";
          const next = { ...draft, appearance: { ...draft.appearance, theme: nextMode } };
          setDraft(next);
          void save(next).catch(() => {});
          setOpen(false);
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
      action: () => {
        setOpen(false);
        router.push(m.href);
      },
    }));

    return [...(debounced.length >= 2 ? remoteItems : []), ...navItems, ...(q ? [] : quickActions)];
  }, [query, debounced, remoteItems, draft, setDraft, save, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-start justify-center pt-[12vh] p-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="لوحة الأوامر والبحث السريع"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-[var(--popover)] text-[var(--foreground)] border border-[var(--border)] shadow-2xl overflow-hidden motion-dialog-panel"
        data-open="true"
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--primary)] shrink-0" />
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
            placeholder="انتقل إلى وحدة، ابحث عن أصل أو موظف أو تذكرة..."
            className="flex-1 bg-transparent text-xs sm:text-sm outline-none border-0"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق لوحة الأوامر"
            className="p-1 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--muted-foreground)]">
              لا توجد نتائج مطابقة
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
                    selected ? "bg-[var(--selected)] text-[var(--foreground)]" : "hover:bg-[var(--hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.id === "cmd-toggle-theme" ? (
                      <Sun className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    ) : (
                      <Compass className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold truncate">{item.label}</div>
                      {item.sublabel && (
                        <div className="text-[10px] text-[var(--muted-foreground)] truncate" dir="ltr">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)] shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)]">
                      {item.group}
                    </span>
                    {selected && <ArrowLeft className="w-3.5 h-3.5 text-[var(--primary)]" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-muted)] flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
          <span>استخدم ↑ ↓ للتنقل و Enter للفتح</span>
          <span className="font-mono" dir="ltr">ESC to close</span>
        </div>
      </div>
    </div>
  );
}
