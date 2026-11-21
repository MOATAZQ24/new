"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { mediaUrl } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { useCustomization } from "@/context/CustomizationContext";
import { Icons } from "@/components/ui/Icons";

interface SearchResultItem {
  id: string;
  type: "route" | "task" | "ticket" | "asset" | "employee";
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
}

interface UnreadNotificationItem {
  id: string;
  title: string;
  message: string;
  priority?: string;
  created_at: string;
}

const QUICK_ROUTES: { title: string; subtitle: string; href: string; keywords: string }[] = [
  { title: "لوحة المتابعة", subtitle: "Dashboard", href: "/", keywords: "رئيسية لوحة متابعة dashboard" },
  { title: "الشركات والفروع", subtitle: "Companies & Branches", href: "/companies", keywords: "شركات فروع اقسام branches companies" },
  { title: "الموظفون", subtitle: "Employees", href: "/employees", keywords: "موظف موظفين 360 telegram linking" },
  { title: "الأصول والعهد", subtitle: "Assets & Custody", href: "/assets", keywords: "أصل أصول عهدة عهد assets custody" },
  { title: "الاشتراكات والتراخيص", subtitle: "Subscriptions", href: "/subscriptions", keywords: "اشتراكات تراخيص subscriptions" },
  { title: "Help Desk", subtitle: "الدعم الفني والتذاكر", href: "/tickets", keywords: "تذاكر دعم بلاغ helpdesk tickets" },
  { title: "إدارة المهام", subtitle: "Tasks", href: "/tasks", keywords: "مهام tasks telegram تكليف" },
  { title: "سجل الأصول التقنية", subtitle: "IT Assets", href: "/assets", keywords: "أصول لابتوب أجهزة assets" },
  { title: "الأصول الرقمية والخزنة", subtitle: "Digital Vault", href: "/digital-assets", keywords: "خزنة كلمات سر رقمية vault" },
  { title: "عهدة الأصول", subtitle: "Asset Custody", href: "/custody", keywords: "عهدة تسليم custody" },
  { title: "البنية التحتية", subtitle: "Infrastructure", href: "/infrastructure", keywords: "خوادم شبكات ip infrastructure" },
  { title: "الاشتراكات الخارجية", subtitle: "Subscriptions", href: "/subscriptions", keywords: "اشتراكات تراخيص رخص" },
  { title: "الصيانة والتغييرات", subtitle: "Maintenance", href: "/maintenance", keywords: "صيانة تغيير maintenance" },
  { title: "مركز الإشعارات", subtitle: "Notifications", href: "/notifications", keywords: "إشعارات تنبيهات" },
  { title: "التقارير والتصدير", subtitle: "Reports & CSV", href: "/reports", keywords: "تقارير تصدير csv" },
  { title: "سجل المراجعة والتدقيق", subtitle: "Audit Log", href: "/audit", keywords: "تدقيق مراجعة سجل audit" },
  { title: "التكاملات وإعدادات Telegram", subtitle: "Integrations", href: "/settings/integrations", keywords: "تكامل بوت تيليجرام n8n" },
  { title: "تخصيص الواجهة والمظهر", subtitle: "Appearance", href: "/settings/appearance", keywords: "مظهر ألوان داكن appearance" },
];

function getQuickRouteResults(query: string): SearchResultItem[] {
  const qLower = query.toLowerCase();
  return QUICK_ROUTES.filter(
    (route) =>
      route.title.toLowerCase().includes(qLower) ||
      route.subtitle.toLowerCase().includes(qLower) ||
      route.keywords.toLowerCase().includes(qLower)
  )
    .slice(0, 3)
    .map((route) => ({
      id: `route-${route.href}`,
      type: "route",
      title: route.title,
      subtitle: route.subtitle,
      href: route.href,
      badge: "صفحة",
    }));
}

type PopoverType = "company" | "user" | "notifications" | "search" | null;

interface TopNavProps {
  mobileMenuOpen?: boolean;
  onOpenMobileMenu?: () => void;
}

export function TopNav({ mobileMenuOpen = false, onOpenMobileMenu }: TopNavProps) {
  const router = useRouter();
  const { user, activeCompany, activeCompanyId, setActiveCompanyId, logout } = useAuth();
  const { theme, setTheme, resolvedTheme, companyBranding } = useCustomization();

  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 220);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadItems, setUnreadItems] = useState<UnreadNotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState<boolean>(false);

  const headerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRevisionRef = useRef(0);

  const effectiveLogo =
    companyBranding?.company_logo || (activeCompany as { company_logo?: string } | null)?.company_logo;

  const toggleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  // Close popovers on outside click or Escape
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenPopover(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setOpenPopover("search");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!user || !activeCompanyId) return;
    let active = true;
    api
      .get<{ telegram_connected?: boolean }>("/dashboard")
      .then((res) => {
        if (active && res.data && typeof res.data.telegram_connected === "boolean") {
          setTelegramConnected(res.data.telegram_connected);
        }
      })
      .catch(() => {
        if (active) setTelegramConnected(false);
      });
    return () => {
      active = false;
    };
  }, [user, activeCompanyId]);

  // Fetch unread notifications summary for the bell badge
  const fetchUnreadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingNotifications(true);
      const res = await api.get<UnreadNotificationItem[]>("/notifications?unread_only=true&per_page=6");
      setUnreadItems(Array.isArray(res.data) ? res.data : []);
      const totalFromMeta =
        typeof (res as unknown as { pagination?: { total?: number } }).pagination?.total === "number"
          ? (res as unknown as { pagination: { total: number } }).pagination.total
          : Array.isArray(res.data)
          ? res.data.length
          : 0;
      setUnreadCount(totalFromMeta);
    } catch {
      // Keep bell non-disruptive if user lacks permissions or offline
    } finally {
      setLoadingNotifications(false);
    }
  }, [user]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchUnreadNotifications();
    }, 0);
    const interval = setInterval(fetchUnreadNotifications, 45000);
    const onNotifUpdated = () => fetchUnreadNotifications();
    window.addEventListener("notifications:updated", onNotifUpdated);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
      window.removeEventListener("notifications:updated", onNotifUpdated);
    };
  }, [fetchUnreadNotifications, activeCompanyId]);

  const handleMarkSingleRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setUnreadItems((prev) => prev.filter((item) => item.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore quietly
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setUnreadItems([]);
      setUnreadCount(0);
    } catch {
      // Ignore quietly
    }
  };

  // Run debounced global search across system endpoints and quick routes
  useEffect(() => {
    let cancelled = false;
    if (debouncedQuery.length < 2) return;
    const revision = searchRevisionRef.current;
    const matchedRoutes = getQuickRouteResults(debouncedQuery);

    const runSearch = async () => {
      setSearching(true);
      const qEnc = encodeURIComponent(debouncedQuery);
      const [tasksRes, ticketsRes, assetsRes, empRes] = await Promise.allSettled([
        api.get<Array<{ id: string; title: string; status: string; reference?: string }>>(`/tasks?search=${qEnc}&per_page=3`),
        api.get<Array<{ id: string; issue_title: string; ticket_number: string; status: string }>>(`/tickets?search=${qEnc}&per_page=3`),
        api.get<Array<{ id: string; asset_name: string; asset_code: string; status: string }>>(`/assets?search=${qEnc}&per_page=3`),
        api.get<Array<{ id: string; full_name: string; job_title?: string; department_name?: string }>>(`/employees?search=${qEnc}&per_page=3`),
      ]);

      if (cancelled || revision !== searchRevisionRef.current) return;
      const items: SearchResultItem[] = [...matchedRoutes];

      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)) {
        for (const t of tasksRes.value.data.slice(0, 3)) {
          items.push({
            id: `task-${t.id}`,
            type: "task",
            title: t.title,
            subtitle: t.reference ? `#${t.reference}` : "مهمة تشغيلية",
            href: "/tasks",
            badge: t.status,
          });
        }
      }

      if (ticketsRes.status === "fulfilled" && Array.isArray(ticketsRes.value.data)) {
        for (const tk of ticketsRes.value.data.slice(0, 3)) {
          items.push({
            id: `ticket-${tk.id}`,
            type: "ticket",
            title: tk.issue_title,
            subtitle: tk.ticket_number,
            href: "/tickets",
            badge: tk.status,
          });
        }
      }

      if (assetsRes.status === "fulfilled" && Array.isArray(assetsRes.value.data)) {
        for (const ast of assetsRes.value.data.slice(0, 3)) {
          items.push({
            id: `asset-${ast.id}`,
            type: "asset",
            title: ast.asset_name,
            subtitle: ast.asset_code,
            href: "/assets",
            badge: ast.status,
          });
        }
      }

      if (empRes.status === "fulfilled" && Array.isArray(empRes.value.data)) {
        for (const emp of empRes.value.data.slice(0, 3)) {
          items.push({
            id: `emp-${emp.id}`,
            type: "employee",
            title: emp.full_name,
            subtitle: emp.job_title || emp.department_name || "موظف",
            href: "/employees",
            badge: "موظف",
          });
        }
      }

      setSearchResults(items);
      setActiveSearchIndex(-1);
      setSearching(false);
    };

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const navigateSearchItem = (href: string) => {
    setOpenPopover(null);
    searchRevisionRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setActiveSearchIndex(-1);
    router.push(href);
  };

  return (
    <header
      ref={headerRef}
      className="workspace-topnav h-16 bg-[var(--header-background)] border-b border-[var(--border)] fixed top-0 z-30 flex items-center justify-between px-3 sm:px-6 shadow-xs select-none transition-all duration-200 gap-2"
    >
      {/* Right Side (Mobile Menu, Company Switcher & Command Search) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="فتح قائمة التنقل"
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation"
            className="lg:hidden motion-control p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <Icons.Menu size={20} />
          </button>
        )}

        {/* Company Switcher */}
        <div className="relative shrink min-w-0">
          <button
            type="button"
            aria-expanded={openPopover === "company"}
            aria-haspopup="menu"
            onClick={() => setOpenPopover(openPopover === "company" ? null : "company")}
            className="motion-control h-9 flex max-w-full items-center gap-2 px-2.5 sm:px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#187A5A] text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {effectiveLogo ? (
              <img
                src={effectiveLogo.startsWith("/workspace/") ? mediaUrl(effectiveLogo) : effectiveLogo}
                alt=""
                className="w-5 h-5 object-contain rounded shrink-0"
              />
            ) : (
              <Icons.Companies size={16} className="text-[#187A5A] shrink-0" />
            )}
            <span className="min-w-0 truncate max-w-[110px] sm:max-w-[180px]">
              {companyBranding?.brand_name_ar || (activeCompany ? activeCompany.name_ar : "اختر الشركة")}
            </span>
            <Icons.ChevronDown size={14} className="text-slate-500 shrink-0" />
          </button>

          {openPopover === "company" && user && (
            <div
              role="menu"
              className="motion-popover absolute inset-inline-start-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5 z-50"
            >
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700">
                الشركات المصرح بها
              </div>
              {user.companies.map((c) => (
                <button
                  key={c.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setActiveCompanyId(c.id);
                    setOpenPopover(null);
                  }}
                  className={`motion-control w-full text-right px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer ${
                    c.id === activeCompanyId
                      ? "text-[#187A5A] font-bold bg-[#187A5A]/5"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <div className="truncate flex items-center gap-2">
                    {(c as { company_logo?: string }).company_logo ? (
                      <img src={(c as { company_logo?: string }).company_logo} alt="" className="w-4 h-4 object-contain rounded" />
                    ) : null}
                    <div className="truncate">
                      <div className="truncate">{c.name_ar}</div>
                      <div className="text-[10px] text-slate-500">{c.name_en}</div>
                    </div>
                  </div>
                  {c.id === activeCompanyId && (
                    <Icons.Check size={14} className="text-[#187A5A] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live Global Search */}
        <div className="relative hidden lg:block flex-1 max-w-sm">
          <div className="h-9 flex items-center gap-2 bg-slate-100/80 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 focus-within:border-[#187A5A] focus-within:bg-white dark:focus-within:bg-slate-900 px-3 rounded-xl transition-all">
            <Icons.Search
              size={15}
              className="text-slate-500 pointer-events-none shrink-0"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={openPopover === "search" && (searchQuery.trim().length > 0 || searching)}
              aria-controls={
                openPopover === "search" && (searchQuery.trim().length > 0 || searching)
                  ? "global-search-results"
                  : undefined
              }
              aria-activedescendant={activeSearchIndex >= 0 ? `global-search-option-${activeSearchIndex}` : undefined}
              aria-busy={searching}
              aria-label="بحث في الأصول، التذاكر، الموظفين"
              placeholder="بحث ..."
              onFocus={() => setOpenPopover("search")}
              onChange={(e) => {
                const value = e.target.value;
                searchRevisionRef.current += 1;
                setSearchQuery(value);
                setSearchResults(value.trim() ? getQuickRouteResults(value.trim()) : []);
                setSearching(false);
                setActiveSearchIndex(-1);
                setOpenPopover("search");
              }}
              onKeyDown={(e) => {
                if ((e.key === "ArrowDown" || e.key === "ArrowUp") && searchResults.length > 0) {
                  e.preventDefault();
                  setActiveSearchIndex((current) => {
                    if (current < 0) return e.key === "ArrowDown" ? 0 : searchResults.length - 1;
                    return e.key === "ArrowDown"
                      ? (current + 1) % searchResults.length
                      : (current - 1 + searchResults.length) % searchResults.length;
                  });
                } else if (e.key === "Escape") {
                  setOpenPopover(null);
                } else if (e.key === "Enter" && searchResults.length > 0) {
                  e.preventDefault();
                  navigateSearchItem(searchResults[Math.max(activeSearchIndex, 0)].href);
                }
              }}
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="مسح البحث العام"
                onClick={() => {
                  searchRevisionRef.current += 1;
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearching(false);
                  setActiveSearchIndex(-1);
                }}
                className="p-0.5 text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
              >
                <Icons.X size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("ig:open-command-palette"))}
                title="فتح لوحة الأوامر السريعة (Ctrl+K)"
                dir="ltr"
                className="text-[10px] font-mono text-slate-500 bg-white/90 dark:bg-slate-700 hover:border-[#187A5A] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 shrink-0 cursor-pointer"
              >
                Ctrl+K
              </button>
            )}
          </div>

          {openPopover === "search" && (searchQuery.trim().length > 0 || searching) && (
            <div className="motion-popover absolute inset-inline-start-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-50 max-h-96 overflow-y-auto">
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span>نتائج البحث السريع</span>
                {searching && <span role="status" className="text-[10px] text-[#187A5A]">جاري البحث...</span>}
              </div>
              {searchResults.length === 0 && !searching ? (
                <div role="status" className="px-4 py-6 text-center text-xs text-slate-600 dark:text-slate-300">
                  لا توجد نتائج مطابقة لـ &ldquo;{searchQuery}&rdquo;
                </div>
              ) : null}
              <div
                id="global-search-results"
                role="listbox"
                aria-label="نتائج البحث السريع"
                aria-busy={searching}
                className="divide-y divide-slate-100 dark:divide-slate-700"
              >
                {searchResults.map((item, index) => (
                    <button
                      key={item.id}
                      id={`global-search-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeSearchIndex === index}
                      tabIndex={-1}
                      onClick={() => navigateSearchItem(item.href)}
                      onMouseMove={() => setActiveSearchIndex(index)}
                      className={`motion-dropdown-option w-full text-right px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        activeSearchIndex === index ? "bg-slate-50 dark:bg-slate-700/70" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                            <bdi>{item.subtitle}</bdi>
                          </div>
                        )}
                      </div>
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Left Side (Fullscreen, Monitor, Telegram, Live Notifications & User Profile) */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Fullscreen Button (Reference 1 & 2) */}
        <button
          type="button"
          onClick={() => {
            if (typeof document !== "undefined") {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }
          }}
          aria-label="ملء الشاشة"
          title="ملء الشاشة / إلغاء ملء الشاشة"
          className="hidden md:inline-flex motion-control p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>

        {/* Monitor / Screen View Button (Reference 1 & 2) */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("ig:toggle-display-mode"))}
          aria-label="عرض الشاشة"
          title="تبديل وضع العرض"
          className="hidden md:inline-flex motion-control p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Icons.Monitor size={18} />
        </button>

        {/* Telegram Live Status Pill (Reference 1 & 2) */}
        <Link
          href="/settings/integrations"
          title={telegramConnected ? "ربط Telegram نشط ومتصل" : "إعداد ربط Telegram"}
          className="hidden md:inline-flex h-9 items-center gap-2 px-3.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:border-primary/50 transition-colors text-xs shrink-0"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm animate-pulse" />
          <span className="font-semibold text-slate-800 dark:text-slate-100" dir="ltr">
            Telegram
          </span>
        </Link>

        {/* Live Notification Bell Popover */}
        <div className="relative">
          <button
            type="button"
            aria-label="الإشعارات"
            aria-expanded={openPopover === "notifications"}
            onClick={() => {
              const next = openPopover === "notifications" ? null : "notifications";
              setOpenPopover(next);
              if (next === "notifications") void fetchUnreadNotifications();
            }}
            className="motion-control relative p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-[#187A5A] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="الإشعارات"
          >
            <Icons.Notifications size={18} />
            {unreadCount > 0 && (
              <span
                aria-label={`${unreadCount} إشعار غير مقروء`}
                className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--surface)]"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {openPopover === "notifications" && (
            <div className="motion-popover absolute inset-inline-end-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    الإشعارات غير المقروءة
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-[#187A5A] hover:underline cursor-pointer"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                {loadingNotifications ? (
                  <div className="p-4 text-center text-xs text-slate-500">جاري التحديث...</div>
                ) : unreadItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600 dark:text-slate-300">
                    لا توجد إشعارات جديدة غير مقروءة
                  </div>
                ) : (
                  unreadItems.map((n) => (
                    <div
                      key={n.id}
                      className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {n.title}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        <div className="text-[10px] text-slate-500 mt-1" dir="ltr">
                          {n.created_at?.slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleMarkSingleRead(n.id)}
                        aria-label="تحديد كمقروء"
                        title="تحديد كمقروء"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#187A5A] hover:bg-emerald-50 transition-colors cursor-pointer shrink-0"
                      >
                        <Icons.Check size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 text-center">
                <Link
                  href="/notifications"
                  onClick={() => setOpenPopover(null)}
                  className="text-xs font-bold text-[#187A5A] hover:underline"
                >
                  عرض مركز الإشعارات بالكامل
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            type="button"
            aria-expanded={openPopover === "user"}
            aria-haspopup="menu"
            onClick={() => setOpenPopover(openPopover === "user" ? null : "user")}
            className="motion-control flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[#123D32] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#C5A46D]/30 shrink-0">
              {user?.full_name ? user.full_name[0] : "A"}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {user?.full_name || user?.username || "مدير النظام"}
              </div>
              <div className="text-[10px] text-[#187A5A] font-semibold">
                {user?.roles?.[0] || (user?.is_superadmin ? "مدير النظام العام" : "موظف")}
              </div>
            </div>
            <Icons.ChevronDown size={14} className="text-slate-500 shrink-0" />
          </button>

          {openPopover === "user" && (
            <div
              role="menu"
              className="motion-popover absolute inset-inline-end-0 mt-2 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5 z-50"
            >
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {user?.full_name || user?.username}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                  <bdi dir="ltr">{user?.email}</bdi>
                </div>
              </div>

              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setOpenPopover(null)}
                className="motion-control block px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                إعدادات الحساب وكلمة المرور
              </Link>

              <Link
                href="/settings/appearance"
                role="menuitem"
                onClick={() => setOpenPopover(null)}
                className="motion-control block px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                المظهر وتخصيص الواجهة
              </Link>

              <Link
                href="/settings/branding"
                role="menuitem"
                onClick={() => setOpenPopover(null)}
                className="motion-control block px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                شعار وهوية الشركة (Branding)
              </Link>

              <Link
                href="/help"
                role="menuitem"
                onClick={() => setOpenPopover(null)}
                className="motion-control block px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-t border-slate-100 dark:border-slate-700"
              >
                مركز المساعدة والتعلّم
              </Link>

              <Link
                href="/about"
                role="menuitem"
                onClick={() => setOpenPopover(null)}
                className="motion-control block px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                حول النظام والمطور والتراخيص
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="motion-control w-full text-right px-3.5 py-2 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-between transition-colors border-t border-slate-100 dark:border-slate-700 cursor-pointer"
              >
                <span>تسجيل الخروج</span>
                <Icons.LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
