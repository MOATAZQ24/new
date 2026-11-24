"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { mediaUrl } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { useCustomization } from "@/context/CustomizationContext";
import { Avatar } from "@/components/ui/avatar";

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
  { title: "أعمالي", subtitle: "My Work", href: "/my-work", keywords: "أعمالي my work" },
  { title: "لوحة التحكم", subtitle: "Dashboard", href: "/", keywords: "رئيسية لوحة dashboard" },
  { title: "مكتب المساعدة", subtitle: "Help Desk", href: "/tickets", keywords: "تذاكر دعم بلاغ helpdesk tickets" },
  { title: "إدارة المهام", subtitle: "Tasks", href: "/tasks", keywords: "مهام tasks كانبان" },
  { title: "التوزيع و SLA", subtitle: "Work Management", href: "/settings/work-management", keywords: "توزيع sla فرق قواعد" },
  { title: "الأصول التقنية", subtitle: "IT Assets", href: "/assets", keywords: "أصول لابتوب أجهزة assets" },
  { title: "العهدة والتسليم", subtitle: "Custody", href: "/custody", keywords: "عهدة تسليم custody" },
  { title: "البنية التحتية", subtitle: "Infrastructure", href: "/infrastructure", keywords: "خوادم شبكات ip infrastructure" },
  { title: "خزنة الأصول الرقمية", subtitle: "Digital Vault", href: "/digital-assets", keywords: "خزنة رقمية vault" },
  { title: "الاشتراكات والتراخيص", subtitle: "Subscriptions", href: "/subscriptions", keywords: "اشتراكات تراخيص subscriptions" },
  { title: "الموظفون", subtitle: "Employees", href: "/employees", keywords: "موظف موظفين employees" },
  { title: "الشركات والفروع", subtitle: "Companies", href: "/companies", keywords: "شركات فروع companies" },
  { title: "التقارير والتصدير", subtitle: "Reports", href: "/reports", keywords: "تقارير تصدير csv reports" },
  { title: "الإعدادات", subtitle: "Settings", href: "/settings", keywords: "إعدادات مظهر settings" },
];

function getQuickRouteResults(query: string): SearchResultItem[] {
  const qLower = query.toLowerCase();
  return QUICK_ROUTES.filter(
    (r) => r.title.toLowerCase().includes(qLower) || r.subtitle.toLowerCase().includes(qLower) || r.keywords.toLowerCase().includes(qLower)
  )
    .slice(0, 4)
    .map((r) => ({ id: `route-${r.href}`, type: "route", title: r.title, subtitle: r.subtitle, href: r.href, badge: "صفحة" }));
}

type PopoverType = "company" | "user" | "notifications" | "search" | null;

interface TopNavProps {
  mobileMenuOpen?: boolean;
  onOpenMobileMenu?: () => void;
}

export function TopNav({ mobileMenuOpen = false, onOpenMobileMenu }: TopNavProps) {
  const router = useRouter();
  const { user, activeCompany, activeCompanyId, setActiveCompanyId, logout } = useAuth();
  const { companyBranding } = useCustomization();

  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 220);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadItems, setUnreadItems] = useState<UnreadNotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRevisionRef = useRef(0);

  const effectiveLogo =
    companyBranding?.company_logo || (activeCompany as { company_logo?: string } | null)?.company_logo;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpenPopover(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPopover(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ig:open-command-palette"));
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const fetchUnreadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingNotifications(true);
      const res = await api.get<UnreadNotificationItem[]>("/notifications?unread_only=true&per_page=8");
      setUnreadItems(Array.isArray(res.data) ? res.data : []);
      const total = typeof (res as unknown as { pagination?: { total?: number } }).pagination?.total === "number"
        ? (res as unknown as { pagination: { total: number } }).pagination.total
        : Array.isArray(res.data) ? res.data.length : 0;
      setUnreadCount(total);
    } catch {
      // Quiet fallback
    } finally {
      setLoadingNotifications(false);
    }
  }, [user]);

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchUnreadNotifications(), 0);
    const interval = setInterval(fetchUnreadNotifications, 60000);
    const onUpdated = () => void fetchUnreadNotifications();
    window.addEventListener("notifications:updated", onUpdated);
    return () => {
      window.clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("notifications:updated", onUpdated);
    };
  }, [fetchUnreadNotifications, activeCompanyId]);

  const handleMarkSingleRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setUnreadItems((prev) => prev.filter((item) => item.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setUnreadItems([]);
      setUnreadCount(0);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    if (debouncedQuery.length < 2) return;
    const revision = searchRevisionRef.current;
    const matchedRoutes = getQuickRouteResults(debouncedQuery);

    const runSearch = async () => {
      setSearching(true);
      const qEnc = encodeURIComponent(debouncedQuery);
      const [tasksRes, ticketsRes, assetsRes] = await Promise.allSettled([
        api.get<Array<{ id: string; title: string; status: string }>>(`/tasks?search=${qEnc}&per_page=3`),
        api.get<Array<{ id: string; issue_title: string; ticket_number: string; status: string }>>(`/tickets?search=${qEnc}&per_page=3`),
        api.get<Array<{ id: string; asset_name: string; asset_code: string; status: string }>>(`/assets?search=${qEnc}&per_page=3`),
      ]);
      if (cancelled || revision !== searchRevisionRef.current) return;
      const items: SearchResultItem[] = [...matchedRoutes];
      if (ticketsRes.status === "fulfilled" && Array.isArray(ticketsRes.value.data)) {
        for (const t of ticketsRes.value.data.slice(0, 3)) {
          items.push({ id: `t-${t.id}`, type: "ticket", title: t.issue_title, subtitle: t.ticket_number, href: `/tickets?ticket=${t.id}`, badge: "تذكرة" });
        }
      }
      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)) {
        for (const t of tasksRes.value.data.slice(0, 3)) {
          items.push({ id: `k-${t.id}`, type: "task", title: t.title, href: "/tasks", badge: "مهمة" });
        }
      }
      if (assetsRes.status === "fulfilled" && Array.isArray(assetsRes.value.data)) {
        for (const a of assetsRes.value.data.slice(0, 3)) {
          items.push({ id: `a-${a.id}`, type: "asset", title: a.asset_name, subtitle: a.asset_code, href: "/assets", badge: "أصل" });
        }
      }
      setSearchResults(items);
      setSearching(false);
    };
    void runSearch();
    return () => { cancelled = true; };
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
      className="workspace-topnav h-[52px] bg-[var(--surface)] border-b border-[var(--border)] fixed top-0 z-30 flex items-center justify-between px-3 sm:px-5 gap-3 select-none"
    >
      {/* Inline-Start: Mobile Drawer Trigger + Company Switcher */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="فتح قائمة التنقل"
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-6)] text-[var(--text)] hover:bg-[var(--surface-2)] cursor-pointer shrink-0"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
        )}

        <div className="relative min-w-0">
          <button
            type="button"
            aria-expanded={openPopover === "company"}
            aria-haspopup="menu"
            onClick={() => setOpenPopover(openPopover === "company" ? null : "company")}
            className="h-8 flex max-w-full items-center gap-2 px-2.5 rounded-[var(--radius-6)] border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text)] transition-colors cursor-pointer"
          >
            {effectiveLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={effectiveLogo.startsWith("/workspace/") ? mediaUrl(effectiveLogo) : effectiveLogo} alt="" className="w-4 h-4 object-contain rounded shrink-0" />
            ) : (
              <Building2 className="h-4 w-4 text-[var(--primary-text)] shrink-0" strokeWidth={1.5} />
            )}
            <span className="min-w-0 truncate max-w-[140px] sm:max-w-[200px]">
              {companyBranding?.brand_name_ar || activeCompany?.name_ar || "بوابة المستثمر"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--icon-muted)] shrink-0" strokeWidth={1.5} />
          </button>

          {openPopover === "company" && user && (
            <div role="menu" className="motion-popover absolute start-0 mt-1.5 w-64 rounded-[var(--radius-10)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-e2)] py-1.5 z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-3)] border-b border-[var(--border)]">
                الشركات المصرح بها
              </div>
              {user.companies.map((c) => (
                <button
                  key={c.id}
                  role="menuitem"
                  type="button"
                  onClick={() => { setActiveCompanyId(c.id); setOpenPopover(null); }}
                  className={`w-full text-start px-3 py-2 text-[13px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    c.id === activeCompanyId ? "bg-[var(--primary-soft)] text-[var(--primary-text)] font-semibold" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate">{c.name_ar}</div>
                    <div className="text-[11px] text-[var(--text-3)] truncate">{c.name_en}</div>
                  </div>
                  {c.id === activeCompanyId && <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Search + Command Palette Trigger */}
      <div className="relative hidden md:block flex-1 max-w-md">
        <div className="h-8 flex items-center gap-2 rounded-[var(--radius-6)] bg-[var(--surface-2)] border border-[var(--border)] focus-within:bg-[var(--surface)] focus-within:border-[var(--primary)] focus-within:shadow-[var(--focus-ring)] px-2.5 transition-colors">
          <Search className="h-3.5 w-3.5 text-[var(--icon-muted)] shrink-0" strokeWidth={1.5} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={openPopover === "search" && (searchQuery.trim().length > 0 || searching)}
            aria-controls={openPopover === "search" ? "global-search-results" : undefined}
            aria-label="بحث في الأصول والتذاكر والمهام"
            placeholder="بحث سريع في التذاكر، المهام، الأصول..."
            dir="auto"
            onFocus={() => setOpenPopover("search")}
            onChange={(e) => {
              const val = e.target.value;
              searchRevisionRef.current += 1;
              setSearchQuery(val);
              setSearchResults(val.trim() ? getQuickRouteResults(val.trim()) : []);
              setSearching(false);
              setActiveSearchIndex(-1);
              setOpenPopover("search");
            }}
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "ArrowUp") && searchResults.length > 0) {
                e.preventDefault();
                setActiveSearchIndex((cur) => cur < 0 ? 0 : e.key === "ArrowDown" ? (cur + 1) % searchResults.length : (cur - 1 + searchResults.length) % searchResults.length);
              } else if (e.key === "Escape") {
                setOpenPopover(null);
              } else if (e.key === "Enter" && searchResults.length > 0) {
                e.preventDefault();
                navigateSearchItem(searchResults[Math.max(activeSearchIndex, 0)].href);
              }
            }}
            className="flex-1 min-w-0 bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
          />
          {searchQuery ? (
            <button type="button" aria-label="مسح البحث" onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="p-0.5 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer">
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ig:open-command-palette"))}
              title="لوحة الأوامر السريعة (Ctrl+K)"
              dir="ltr"
              className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)] hover:text-[var(--text)] shrink-0 cursor-pointer"
            >
              Ctrl+K
            </button>
          )}
        </div>

        {openPopover === "search" && (searchQuery.trim().length > 0 || searching) && (
          <div id="global-search-results" role="listbox" className="motion-popover absolute start-0 mt-1.5 w-full rounded-[var(--radius-10)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-e2)] py-1.5 z-50 max-h-80 overflow-y-auto">
            {searchResults.length === 0 && !searching ? (
              <div className="px-4 py-6 text-center text-[13px] text-[var(--text-3)]">لا توجد نتائج مطابقة</div>
            ) : (
              searchResults.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={activeSearchIndex === idx}
                  onClick={() => navigateSearchItem(item.href)}
                  className={`w-full text-start px-3 py-2 flex items-center justify-between gap-2 text-[13px] cursor-pointer ${activeSearchIndex === idx ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--text)] truncate">{item.title}</div>
                    {item.subtitle && <div className="text-[11px] text-[var(--text-3)] truncate"><bdi>{item.subtitle}</bdi></div>}
                  </div>
                  {item.badge && <span className="rounded-full bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-2)] shrink-0">{item.badge}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Inline-End: Notifications Bell + User Menu (Clean, Never Clips at 1024px) */}
      <div className="flex items-center gap-1.5 shrink-0">
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
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-6)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute top-1 end-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger-solid)] text-white text-[10px] font-semibold tabular-nums flex items-center justify-center ring-2 ring-[var(--surface)]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {openPopover === "notifications" && (
            <div className="motion-popover absolute end-0 mt-1.5 w-80 sm:w-96 rounded-[var(--radius-10)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-e2)] overflow-hidden z-50">
              <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
                <span className="text-[13px] font-semibold text-[var(--text)]">الإشعارات ({unreadCount})</span>
                {unreadCount > 0 && (
                  <button type="button" onClick={handleMarkAllRead} className="text-[12px] font-medium text-[var(--primary-text)] hover:underline cursor-pointer">
                    تحديد الكل كمقروء
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
                {loadingNotifications ? (
                  <div className="p-4 text-center text-[13px] text-[var(--text-3)]">جارٍ التحديث...</div>
                ) : unreadItems.length === 0 ? (
                  <div className="p-6 text-center text-[13px] text-[var(--text-3)]">لا توجد إشعارات غير مقروءة</div>
                ) : (
                  unreadItems.map((n) => (
                    <div key={n.id} className="p-3 hover:bg-[var(--surface-2)] flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[var(--text)] truncate">{n.title}</div>
                        <p className="text-[12px] text-[var(--text-2)] mt-0.5 line-clamp-2">{n.message}</p>
                        <div className="text-[11px] text-[var(--text-3)] mt-1 tabular-nums" dir="ltr">{n.created_at?.slice(0, 16).replace("T", " ")}</div>
                      </div>
                      <button type="button" onClick={() => handleMarkSingleRead(n.id)} aria-label="تحديد كمقروء" className="p-1.5 rounded-[var(--radius-6)] text-[var(--text-3)] hover:text-[var(--primary-text)] hover:bg-[var(--primary-soft)] cursor-pointer shrink-0">
                        <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="px-3.5 py-2 border-t border-[var(--border)] bg-[var(--surface-2)] text-center">
                <Link href="/notifications" onClick={() => setOpenPopover(null)} className="text-[12px] font-medium text-[var(--primary-text)] hover:underline">
                  عرض جميع الإشعارات
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
            className="flex items-center gap-2 h-9 px-1.5 rounded-[var(--radius-6)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            <Avatar name={user?.full_name || user?.username || "مدير النظام"} size="sm" />
            <div className="hidden sm:block text-start leading-tight">
              <div className="text-[13px] font-medium text-[var(--text)] max-w-[120px] truncate">
                {user?.full_name || user?.username || "مدير النظام"}
              </div>
              <div className="text-[11px] text-[var(--text-3)] max-w-[120px] truncate">
                {user?.roles?.[0] || (user?.is_superadmin ? "مدير النظام" : "موظف")}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--icon-muted)] shrink-0" strokeWidth={1.5} />
          </button>

          {openPopover === "user" && (
            <div role="menu" className="motion-popover absolute end-0 mt-1.5 w-56 rounded-[var(--radius-10)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-e2)] py-1.5 z-50">
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <div className="text-[13px] font-semibold text-[var(--text)] truncate">{user?.full_name || user?.username}</div>
                <div className="text-[11px] text-[var(--text-3)] truncate"><bdi dir="ltr">{user?.email}</bdi></div>
              </div>
              <Link href="/settings" role="menuitem" onClick={() => setOpenPopover(null)} className="block px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]">إعدادات الحساب</Link>
              <Link href="/settings/appearance" role="menuitem" onClick={() => setOpenPopover(null)} className="block px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]">المظهر والتخصيص</Link>
              <Link href="/settings/branding" role="menuitem" onClick={() => setOpenPopover(null)} className="block px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]">هوية الشركة</Link>
              <Link href="/help" role="menuitem" onClick={() => setOpenPopover(null)} className="block px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] border-t border-[var(--border)]">المساعدة</Link>
              <Link href="/about" role="menuitem" onClick={() => setOpenPopover(null)} className="block px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]">حول النظام</Link>
              <button type="button" role="menuitem" onClick={logout} className="w-full text-start px-3 py-2 text-[13px] text-[var(--danger-text)] hover:bg-[var(--danger-soft)] flex items-center justify-between border-t border-[var(--border)] cursor-pointer">
                <span>تسجيل الخروج</span>
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
