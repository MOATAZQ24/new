"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowRight, ArrowUp, Check, CheckCircle2,
  CheckSquare, ChevronRight, Clock, Info, Languages, Lock, Mic, Moon,
  Plus, Search, Send, Shuffle, Sun, Trash2, UserCheck, X,
} from "lucide-react";
import {
  AssetIcon, Avatar, AvatarStack, Badge, BrandLoadingMark, BrandLogo, BrandSymbol,
  Button, CapacityBar, Card, CardContent, CardDescription, CardHeader, CardSkeleton,
  CardTitle, Chip, Combobox, ConfirmDialog, CustodyIcon, DataTable, DirectionalIcon,
  EmptyState, FirewallIcon, FormField, Input, Modal, Popover, PriorityBadge, Progress,
  SegmentedControl, Select, StatusBadge, SwitchIcon, Tabs, TabsContent, TabsList,
  TabsTrigger, Textarea, ToastBanner, Tooltip, VaultIcon, VlanIcon, useToast,
  type ComboboxOption, type DataTableColumn,
} from "@/components/ui";

interface LabTicketRow {
  id: string; ref: string; subject: string; requester: string;
  priority: "Low" | "Medium" | "High" | "Urgent"; status: string;
  slaRemaining: string; slaTone: "success" | "warning" | "danger";
}

const TOKEN_SWATCHES = [
  { name: "--bg", labelAr: "خلفية الصفحة", labelEn: "Canvas", light: "#FAF9F6", dark: "#111413", ratioLight: "16.53:1", ratioDark: "15.40:1", fgVar: "var(--text)" },
  { name: "--surface", labelAr: "السطح الأساسي", labelEn: "Surface", light: "#FFFFFF", dark: "#181C1B", ratioLight: "17.40:1", ratioDark: "14.30:1", fgVar: "var(--text)" },
  { name: "--surface-2", labelAr: "سطح ثانوي", labelEn: "Surface 2", light: "#F4F2EE", dark: "#1F2423", ratioLight: "15.56:1", ratioDark: "13.08:1", fgVar: "var(--text)" },
  { name: "--primary", labelAr: "بترولي أساسي", labelEn: "Petrol Primary", light: "#0E5A63", dark: "#4FB3BC", ratioLight: "7.89:1", ratioDark: "6.98:1", fgVar: "var(--on-primary)" },
  { name: "--primary-soft", labelAr: "تحديد ناعم", labelEn: "Primary Soft", light: "#E3F1F2", dark: "#173033", ratioLight: "6.81:1", ratioDark: "6.90:1", fgVar: "var(--primary-text)" },
  { name: "--text", labelAr: "نص أساسي", labelEn: "Ink Text", light: "#1B1A17", dark: "#ECEAE4", ratioLight: "17.40:1", ratioDark: "14.30:1", fgVar: "var(--bg)" },
  { name: "--text-2", labelAr: "نص ثانوي", labelEn: "Text Secondary", light: "#5E5A52", dark: "#A9A59B", ratioLight: "6.86:1", ratioDark: "7.00:1", fgVar: "var(--bg)" },
  { name: "--text-3", labelAr: "تسمية AA", labelEn: "Caption AA", light: "#6E6960", dark: "#918D84", ratioLight: "5.32:1", ratioDark: "5.20:1", fgVar: "var(--bg)" },
  { name: "--accent", labelAr: "نحاسي دافئ", labelEn: "Warm Brass", light: "#B68F4A", dark: "#D8B36A", ratioLight: "Brand", ratioDark: "Brand", fgVar: "#1B1A17" },
  { name: "--success-soft", labelAr: "نجاح / SLA سليم", labelEn: "Success Soft", light: "#E8F5ED", dark: "#162A1F", ratioLight: "6.42:1", ratioDark: "8.07:1", fgVar: "var(--success-text)" },
  { name: "--warning-soft", labelAr: "تحذير / مخاطرة", labelEn: "Warning Soft", light: "#FCF3E1", dark: "#2E2312", ratioLight: "5.37:1", ratioDark: "8.58:1", fgVar: "var(--warning-text)" },
  { name: "--danger-soft", labelAr: "خطر / خرق SLA", labelEn: "Danger Soft", light: "#FDECEB", dark: "#301816", ratioLight: "6.13:1", ratioDark: "6.22:1", fgVar: "var(--danger-text)" },
  { name: "--info-soft", labelAr: "معلوماتي", labelEn: "Info Soft", light: "#E8F2FA", dark: "#162634", ratioLight: "6.61:1", ratioDark: "6.96:1", fgVar: "var(--info-text)" },
  { name: "--internal-bg", labelAr: "ملاحظة داخلية", labelEn: "Internal Note", light: "#FFF6E5", dark: "#282115", ratioLight: "7.31:1", ratioDark: "10.96:1", fgVar: "var(--internal-text)" },
];

const ASSIGNEE_OPTIONS: ComboboxOption[] = [
  { value: "u-sultan", label: "سلطان العتيبي", subtitle: "مهندس شبكات أول", group: "فريق الشبكات والبنية التحتية", availability: "available", openItems: 4, maxItems: 10, skills: ["VPN", "Firewall", "VLAN"] },
  { value: "u-noura", label: "نورة القحطاني", subtitle: "أخصائية دعم فني L2", group: "فريق الشبكات والبنية التحتية", availability: "away", openItems: 8, maxItems: 10, skills: ["M365", "Identity", "DNS"] },
  { value: "u-khalid", label: "خالد الدوسري", subtitle: "فني أصول وعهدة", group: "فريق مكتب المساعدة والأصول", availability: "busy", openItems: 10, maxItems: 10, skills: ["Hardware", "Custody"], disabled: true, disabledReason: "بلغ الحد الأقصى (10/10)", allowOverride: true },
  { value: "u-faisal", label: "فيصل الشمري", subtitle: "مهندس أنظمة", group: "فريق مكتب المساعدة والأصول", availability: "offline", openItems: 2, maxItems: 8, skills: ["Linux", "Backup"], disabled: true, disabledReason: "في إجازة معتمدة", allowOverride: false },
];

function generateLabRows(count: number, lang: "ar" | "en"): LabTicketRow[] {
  const subjects = lang === "ar"
    ? ["انقطاع اتصال VPN للفرع الإقليمي بالرياض", "تحديث شهادة TLS لخادم البريد الداخلي", "تسليم جهاز محمول ThinkPad P16 لموظف جديد", "تفعيل صلاحية الوصول لخزنة الشهادات الرقمية", "بطء في محول الشبكة الرئيسي بالطابق الثالث"]
    : ["Riyadh regional branch VPN tunnel disconnected", "Renew TLS certificate for internal mail relay", "ThinkPad P16 laptop custody handover for new hire", "Grant temporary access to digital certificates vault", "Packet loss on 3rd floor distribution switch"];
  const reqs = lang === "ar" ? ["أحمد المنصور", "سارة الحربي", "عبدالله الزهراني", "ريم الغامدي"] : ["Ahmad Al-Mansour", "Sara Al-Harbi", "Abdullah Al-Zahrani", "Reem Al-Ghamdi"];
  const prios: LabTicketRow["priority"][] = ["Urgent", "High", "Medium", "Low"];
  const statuses = ["Open", "In Progress", "Waiting for User", "Resolved"];
  return Array.from({ length: count }, (_, idx) => {
    const slaTone = idx % 5 === 0 ? "danger" : idx % 3 === 0 ? "warning" : "success";
    return {
      id: `lab-row-${idx + 1}`, ref: `TCK-2026-${String(idx + 101).padStart(4, "0")}`,
      subject: subjects[idx % 5], requester: reqs[idx % reqs.length], priority: prios[idx % 4],
      status: statuses[idx % 4], slaRemaining: slaTone === "danger" ? "-00:18" : slaTone === "warning" ? "00:34" : "03:45", slaTone,
    };
  });
}

export function DesignLabClient({ initialTheme = "light", initialDir = "rtl" }: { initialTheme?: "light" | "dark"; initialDir?: "rtl" | "ltr" }) {
  const toast = useToast();
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [dir, setDir] = useState<"rtl" | "ltr">(initialDir);
  const lang: "ar" | "en" = dir === "rtl" ? "ar" : "en";

  const [assignee, setAssignee] = useState<string>("u-sultan");
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "workload">("list");
  const [tableState, setTableState] = useState<"data" | "virtualized" | "loading" | "empty" | "error">("data");
  const [sampleText, setSampleText] = useState("");
  const [sampleStatus, setSampleStatus] = useState("In Progress");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [chips, setChips] = useState(["VPN", "Firewall", "SLA الحرج"]);
  const [kanbanPicked, setKanbanPicked] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("dir", dir);
    root.setAttribute("lang", lang);
  }, [theme, dir, lang]);

  const rows = useMemo(() => generateLabRows(tableState === "virtualized" ? 250 : 6, lang), [tableState, lang]);
  const columns = useMemo<DataTableColumn<LabTicketRow>[]>(() => [
    { id: "ref", header: lang === "ar" ? "الرقم" : "Ticket ID", width: "145px", numeric: true, sortValue: (r) => r.ref, accessor: (r) => <bdi className="font-mono text-[12px] font-medium text-[var(--primary-text)]">{r.ref}</bdi> },
    { id: "subject", header: lang === "ar" ? "الموضوع" : "Subject", sortValue: (r) => r.subject, accessor: (r) => <div className="max-w-[340px] truncate font-medium text-[var(--text)]" dir="auto">{r.subject}</div> },
    { id: "requester", header: lang === "ar" ? "مقدم الطلب" : "Requester", sortValue: (r) => r.requester, accessor: (r) => <span className="text-[var(--text-2)]">{r.requester}</span> },
    { id: "priority", header: lang === "ar" ? "الأولوية" : "Priority", accessor: (r) => <PriorityBadge priority={r.priority} lang={lang} /> },
    { id: "status", header: lang === "ar" ? "الحالة" : "Status", accessor: (r) => <StatusBadge status={r.status} lang={lang} /> },
    { id: "sla", header: "SLA", align: "end", numeric: true, accessor: (r) => <Badge tone={r.slaTone} icon={r.slaTone === "danger" ? <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> : r.slaTone === "warning" ? <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />}><bdi className="tabular-nums">{r.slaRemaining}</bdi></Badge> },
  ], [lang]);

  return (
    <div dir={dir} data-theme={theme} className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 h-[52px] border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-full max-w-[1360px] items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="sm:hidden"><BrandSymbol size={28} /></span>
            <span className="hidden sm:inline-flex"><BrandLogo variant="horizontal" size={28} /></span>
            <span className="hidden md:inline-block h-4 w-px bg-[var(--border)]" aria-hidden="true" />
            <span className="hidden md:inline-flex">
              <Badge tone="primary" icon={<Info className="h-3 w-3" strokeWidth={1.5} />}>
                {lang === "ar" ? "مختبر نظام التصميم · Phase 4A" : "Design System Lab · Phase 4A"}
              </Badge>
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setDir((d) => (d === "rtl" ? "ltr" : "rtl"))} leadingIcon={<Languages className="h-4 w-4" strokeWidth={1.5} />}>
              {dir === "rtl" ? "EN / LTR" : "عربي / RTL"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} leadingIcon={theme === "light" ? <Moon className="h-4 w-4" strokeWidth={1.5} /> : <Sun className="h-4 w-4" strokeWidth={1.5} />}>
              {theme === "light" ? (lang === "ar" ? "الوضع الليلي" : "Dark") : (lang === "ar" ? "الوضع النهاري" : "Light")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div className="space-y-1">
            <h1 className="text-[24px] font-semibold leading-[1.35] text-[var(--text)]">
              {lang === "ar" ? "نظام تصميم بوابة المستثمر — المرحلة 4A" : "Investor Gate OS Design System — Phase 4A"}
            </h1>
            <p className="text-[14px] text-[var(--text-2)] max-w-2xl">
              {lang === "ar"
                ? "مصدر واحد للرموز اللونية والطباعية، شعار العتبة الصاعدة الأصيل، و19 مكوّناً معيارياً بتباين WCAG 2.2 AA في الوضعين النهاري والليلي والاتجاهين RTL و LTR."
                : "Single source of truth for Petrol & Warm Paper tokens, approved Rising Threshold SVG brand kit, and 19 WCAG 2.2 AA verified CVA primitives."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => toast.success(lang === "ar" ? "تم تعيين التذكرة إلى سلطان العتيبي" : "Assigned ticket to Sultan Al-Otaibi", lang === "ar" ? "تحديث فوري" : "Optimistic update", { label: lang === "ar" ? "تراجع (6 ثوانٍ)" : "Undo (6s)", onClick: () => setAssignee("u-noura") })}>
              {lang === "ar" ? "اختبار إشعار التراجع" : "Test Undo Toast"}
            </Button>
            <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}>
              {lang === "ar" ? "إجراء رئيسي" : "Primary Action"}
            </Button>
          </div>
        </div>

        <section aria-labelledby="lab-brand" className="space-y-4">
          <h2 id="lab-brand" className="text-[16px] font-semibold text-[var(--text)]">
            {lang === "ar" ? "1. الهوية البصرية ونظام الشعار — العتبة الصاعدة" : "1. Brand Identity & Logo System — Rising Threshold"}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><div><CardTitle>{lang === "ar" ? "الشعار الأفقي والعمودي" : "Horizontal & Stacked Lockups"}</CardTitle><CardDescription>{lang === "ar" ? "اتزان بصري عربي / إنجليزي" : "Optical AR/EN alignment"}</CardDescription></div></CardHeader>
              <CardContent className="flex flex-col items-start gap-5 pt-4">
                <BrandLogo variant="horizontal" size={36} />
                <div className="w-full border-t border-[var(--border)] pt-4 flex justify-center"><BrandLogo variant="stacked" size={44} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>{lang === "ar" ? "مقاسات الوضوح (16px – 64px)" : "Optical Scale Test (16px – 64px)"}</CardTitle><CardDescription>{lang === "ar" ? "شبكة 32×32 بدون خطوط دقيقة" : "Strict 32×32 grid legibility"}</CardDescription></div></CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  {[16, 24, 32, 48, 64].map((sz) => (
                    <div key={sz} className="flex flex-col items-center gap-1.5"><BrandSymbol size={sz} tone="color" /><span className="text-[11px] text-[var(--text-3)] tabular-nums" dir="ltr">{sz}px</span></div>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-[var(--radius-6)] bg-[var(--brand-petrol-deep)] px-4 py-3 text-white">
                  <BrandLogo variant="horizontal" tone="reversed" size={28} />
                  <span className="text-[12px] font-medium text-white">{lang === "ar" ? "نسخة معكوسة" : "Reversed"}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>{lang === "ar" ? "علامة التحميل والأيقونات التخصصية" : "Loading Mark & Domain Icons"}</CardTitle><CardDescription>{lang === "ar" ? "حركة 600ms آمنة وسمك موحّد 1.5px" : "600ms reduced-motion safe + 1.5px stroke"}</CardDescription></div></CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between rounded-[var(--radius-6)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <BrandLoadingMark size={36} />
                  <div className="text-end"><div className="text-[13px] font-medium text-[var(--text)]">{lang === "ar" ? "نبضة العتبة (600ms)" : "Keystone Pulse (600ms)"}</div><div className="text-[12px] text-[var(--text-3)]">prefers-reduced-motion safe</div></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: lang === "ar" ? "الأصول" : "Asset", icon: <AssetIcon size={20} /> },
                    { name: lang === "ar" ? "العهدة" : "Custody", icon: <CustodyIcon size={20} /> },
                    { name: lang === "ar" ? "محول" : "Switch", icon: <SwitchIcon size={20} /> },
                    { name: lang === "ar" ? "جدار حماية" : "Firewall", icon: <FirewallIcon size={20} /> },
                    { name: "VLAN", icon: <VlanIcon size={20} /> },
                    { name: lang === "ar" ? "الخزنة" : "Vault", icon: <VaultIcon size={20} /> },
                  ].map((item) => (
                    <div key={item.name} className="flex items-center gap-2 rounded-[var(--radius-6)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text-2)]"><span className="text-[var(--primary-text)]">{item.icon}</span><span className="truncate">{item.name}</span></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="lab-tokens" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="lab-tokens" className="text-[16px] font-semibold text-[var(--text)]">{lang === "ar" ? "2. الرموز اللونية ونسب التباين (WCAG 2.2 AA)" : "2. Color Tokens & Verified WCAG 2.2 AA Contrast"}</h2>
            <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />}>{lang === "ar" ? "جميع الأزواج مجتازة AA" : "All text pairs pass AA"}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {TOKEN_SWATCHES.map((sw) => (
              <div key={sw.name} className="overflow-hidden rounded-[var(--radius-10)] border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex h-14 items-end justify-between p-2" style={{ backgroundColor: `var(${sw.name})`, color: sw.fgVar }}>
                  <span className="text-[11px] font-semibold tabular-nums" dir="ltr">{theme === "light" ? sw.ratioLight : sw.ratioDark}</span>
                </div>
                <div className="p-2.5 space-y-0.5">
                  <div className="text-[12px] font-medium text-[var(--text)] truncate">{lang === "ar" ? sw.labelAr : sw.labelEn}</div>
                  <div className="font-mono text-[11px] text-[var(--text-3)] truncate" dir="ltr">{theme === "light" ? sw.light : sw.dark}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="lab-type" className="space-y-4">
          <h2 id="lab-type" className="text-[16px] font-semibold text-[var(--text)]">{lang === "ar" ? "3. السلم الطباعي، محاذاة العربية/الإنجليزية واختبار الحالات القصوى" : "3. Type Scale, Bidi Alignment & Extreme-State Stress Test"}</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="pt-0 space-y-3 divide-y divide-[var(--border)]">
                {[
                  { size: "32px", cls: "text-[32px] font-semibold leading-[1.35]", sampleAr: "بوابة المستثمر للعمليات التقنية", sampleEn: "Investor Gate IT Operations" },
                  { size: "24px", cls: "text-[24px] font-semibold leading-[1.4]", sampleAr: "صندوق التذاكر الموحّد · 42 تذكرة نشطة", sampleEn: "Unified Help Desk · 42 active tickets" },
                  { size: "20px", cls: "text-[20px] font-semibold leading-[1.4]", sampleAr: "توزيع عبء العمل وسياسات مستوى الخدمة", sampleEn: "Workload distribution & SLA policies" },
                  { size: "16px", cls: "text-[16px] font-medium leading-[1.5]", sampleAr: "تذكرة TCK-2026-0049 · خادم 10.10.1.10 · متبقي 00:42:15", sampleEn: "Ticket TCK-2026-0049 · Server 10.10.1.10 · SLA 00:42:15" },
                  { size: "14px", cls: "text-[14px] font-normal leading-[1.6]", sampleAr: "النص الأساسي بسطر مريح 1.6 يدمج IBM Plex Sans Arabic مع IBM Plex Sans لتطابق خط الأساس.", sampleEn: "Base body copy at 1.6 line-height pairing metric-matched IBM Plex Sans Arabic and IBM Plex Sans." },
                  { size: "13px", cls: "text-[13px] font-normal text-[var(--text-2)] leading-[1.5]", sampleAr: "بيانات الجدول والوصف الثانوي بأرقام جدولية 106,170.00 ر.س", sampleEn: "Secondary metadata & table cells with tabular figures 106,170.00 SAR" },
                  { size: "12px", cls: "text-[12px] font-medium text-[var(--text-3)] leading-[1.4]", sampleAr: "تسمية فرعية متوافقة مع تباين WCAG 2.2 AA (5.32:1)", sampleEn: "Tertiary AA-verified caption label (5.32:1)" },
                ].map((row) => (
                  <div key={row.size} className="flex flex-col sm:flex-row sm:items-baseline gap-2 pt-3 first:pt-0">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-[var(--text-3)] tabular-nums" dir="ltr">{row.size}</span>
                    <div className={`${row.cls} tabular-nums min-w-0 break-words`}>{lang === "ar" ? row.sampleAr : row.sampleEn}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>{lang === "ar" ? "اختبار الحالات القصوى (320px)" : "Extreme-State Checklist (320px)"}</CardTitle><CardDescription>{lang === "ar" ? "نصوص عربية طويلة + ثنائي الاتجاه + عكس الأيقونات" : "Long Arabic + bidi + RTL icon mirror"}</CardDescription></div></CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="mx-auto max-w-[288px] rounded-[var(--radius-6)] border border-dashed border-[var(--border-strong)] bg-[var(--bg)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <bdi className="font-mono text-[12px] text-[var(--primary-text)] shrink-0">TCK-2026-9981</bdi>
                    <Badge tone="danger" icon={<AlertCircle className="h-3 w-3" strokeWidth={1.5} />}>{lang === "ar" ? "خرق SLA" : "Breached"}</Badge>
                  </div>
                  <p className="text-[13px] font-medium text-[var(--text)] line-clamp-2 break-words" dir="auto">مشكلةمتواصلةبدونمسافاتفيخادمالشهاداتالرقميةوالمزامنةالدوريةلمحولاتالفرعالإقليميفيالرياض</p>
                  <div className="flex items-center justify-between text-[12px] text-[var(--text-2)]">
                    <span className="truncate">عبدالرحمن بن محمد العبدالكريم آل سعود</span>
                    <DirectionalIcon><ChevronRight className="h-4 w-4 text-[var(--icon-muted)]" strokeWidth={1.5} /></DirectionalIcon>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-[var(--radius-6)] border border-[var(--border)] px-3 py-2 text-[12px]">
                  <span className="text-[var(--text-2)]">{lang === "ar" ? "انعكاس الأيقونات الاتجاهية" : "Directional icon mirror"}</span>
                  <div className="flex items-center gap-2 text-[var(--primary-text)]">
                    <DirectionalIcon><ArrowRight className="h-4 w-4" strokeWidth={1.5} /></DirectionalIcon>
                    <DirectionalIcon><ChevronRight className="h-4 w-4" strokeWidth={1.5} /></DirectionalIcon>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="lab-controls" className="space-y-4">
          <h2 id="lab-controls" className="text-[16px] font-semibold text-[var(--text)]">{lang === "ar" ? "4. الأزرار والحقول وعناصر التحكم" : "4. Buttons, Form Controls, Tabs & Segmented Controls"}</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{lang === "ar" ? "الأزرار والشارات" : "Buttons, Badges & Chips"}</CardTitle></CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary">{lang === "ar" ? "حفظ التغييرات" : "Save changes"}</Button>
                  <Button variant="secondary">{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
                  <Button variant="soft">{lang === "ar" ? "تعيين تلقائي" : "Auto-assign"}</Button>
                  <Button variant="ghost">{lang === "ar" ? "تفاصيل" : "Details"}</Button>
                  <Button variant="danger" leadingIcon={<Trash2 className="h-4 w-4" strokeWidth={1.5} />}>{lang === "ar" ? "حذف" : "Delete"}</Button>
                  <Button variant="primary" loading>{lang === "ar" ? "جارٍ الحفظ" : "Saving"}</Button>
                  <Button variant="primary" disabled>{lang === "ar" ? "معطّل" : "Disabled"}</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="Active" lang={lang} /><StatusBadge status="In Progress" lang={lang} />
                  <StatusBadge status="Waiting for User" lang={lang} /><StatusBadge status="Blocked" lang={lang} />
                  <StatusBadge status="Closed" lang={lang} /><PriorityBadge priority="Urgent" lang={lang} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {chips.map((tag) => (<Chip key={tag} tone="neutral" onRemove={() => setChips((p) => p.filter((x) => x !== tag))} removeLabel={`إزالة ${tag}`}>{tag}</Chip>))}
                  {chips.length === 0 && <Button size="sm" variant="ghost" onClick={() => setChips(["VPN", "Firewall", "SLA الحرج"])}>{lang === "ar" ? "استعادة الوسوم" : "Restore tags"}</Button>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center gap-3">
                    <Avatar name="سلطان العتيبي" availability="available" /><Avatar name="نورة القحطاني" availability="away" /><Avatar name="خالد الدوسري" availability="busy" />
                    <AvatarStack items={[{ name: "سلطان العتيبي" }, { name: "نورة القحطاني" }, { name: "خالد الدوسري" }, { name: "فيصل الشمري" }]} />
                  </div>
                  <SegmentedControl ariaLabel={lang === "ar" ? "طريقة عرض المهام" : "Tasks view mode"} value={viewMode} onChange={setViewMode} options={[{ value: "list", label: lang === "ar" ? "قائمة" : "List", count: 14 }, { value: "kanban", label: lang === "ar" ? "كانبان" : "Kanban" }, { value: "workload", label: lang === "ar" ? "العبء" : "Workload" }]} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{lang === "ar" ? "النماذج أحادية العمود والتبويبات" : "Single-Column Forms & Tabs"}</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-4">
                <FormField label={lang === "ar" ? "البحث في التذاكر والأصول" : "Search tickets & assets"} htmlFor="lab-search" helperText={lang === "ar" ? "استخدم dir=auto للنصوص العربية والإنجليزية المختلطة." : "Supports automatic bidi alignment."}>
                  <Input id="lab-search" placeholder={lang === "ar" ? "مثال: TCK-2026-0049 أو انقطاع الشبكة..." : "e.g. TCK-2026-0049..."} leadingIcon={<Search className="h-4 w-4" strokeWidth={1.5} />} />
                </FormField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label={lang === "ar" ? "حالة التذكرة" : "Ticket Status"} htmlFor="lab-status">
                    <Select id="lab-status" value={sampleStatus} onChange={(e) => setSampleStatus(e.target.value)} options={[{ value: "Open", label: lang === "ar" ? "مفتوحة" : "Open" }, { value: "In Progress", label: lang === "ar" ? "قيد التنفيذ" : "In Progress" }, { value: "Waiting for User", label: lang === "ar" ? "بانتظار المستفيد" : "Waiting for User" }, { value: "Resolved", label: lang === "ar" ? "تم الحل" : "Resolved" }]} />
                  </FormField>
                  <FormField label={lang === "ar" ? "حقل به خطأ تحقق" : "Field with inline error"} htmlFor="lab-err" error={lang === "ar" ? "الحد الأقصى للمهلة لا يمكن أن يكون صفراً." : "Target must exceed 0 minutes."}>
                    <Input id="lab-err" invalid defaultValue="0" />
                  </FormField>
                </div>
                <FormField label={lang === "ar" ? "وصف مختصر (تمدد تلقائي)" : "Auto-grow notes"} htmlFor="lab-notes">
                  <Textarea id="lab-notes" autoGrow rows={2} value={sampleText} onChange={(e) => setSampleText(e.target.value)} placeholder={lang === "ar" ? "اكتب ملاحظة تشغيلية..." : "Write an operational note..."} />
                </FormField>
                <Tabs defaultValue="sla" dir={dir}>
                  <TabsList><TabsTrigger value="sla">{lang === "ar" ? "مؤشرات SLA" : "SLA Metrics"}</TabsTrigger><TabsTrigger value="capacity">{lang === "ar" ? "سعة الفريق" : "Team Capacity"}</TabsTrigger></TabsList>
                  <TabsContent value="sla" className="space-y-2.5">
                    <Progress label={lang === "ar" ? "الالتزام باتفاقية مستوى الخدمة" : "SLA Compliance"} value={92} tone="success" showValue />
                    <Progress label={lang === "ar" ? "تذاكر قريبة من المهلة" : "At-Risk Queue"} value={68} tone="warning" showValue />
                  </TabsContent>
                  <TabsContent value="capacity" className="space-y-2.5">
                    <div className="flex items-center justify-between gap-4 text-[13px]"><span>سلطان العتيبي</span><CapacityBar current={4} max={10} compact /></div>
                    <div className="flex items-center justify-between gap-4 text-[13px]"><span>نورة القحطاني</span><CapacityBar current={8} max={10} compact /></div>
                    <div className="flex items-center justify-between gap-4 text-[13px]"><span>خالد الدوسري</span><CapacityBar current={10} max={10} compact /></div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="lab-signatures" className="space-y-4">
          <h2 id="lab-signatures" className="text-[16px] font-semibold text-[var(--text)]">{lang === "ar" ? "5. المكونات المميزة: المحرر (Composer)، التعيين، وبطاقات كانبان" : "5. Signature Previews: Composer, Assignment & Kanban"}</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><div><CardTitle>{lang === "ar" ? "معاينة حالات المحرر (Phase 4B)" : "Composer States Preview"}</CardTitle><CardDescription>{lang === "ar" ? "حافة 14px، قفل الملاحظة الداخلية بالكهرماني الدافئ، وشريط التسجيل الصوتي" : "14px shell, amber internal lock, and morphing voice bar"}</CardDescription></div></CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="rounded-[var(--radius-14)] border border-[var(--primary)] bg-[var(--surface)] p-3 shadow-[var(--shadow-e1)] ring-2 ring-[var(--primary-soft)]">
                  <p className="text-[14px] text-[var(--text)] leading-[1.6]" dir="auto">{lang === "ar" ? "تم التحقق من نفق VPN للفرع الإقليمي وإعادة تفعيل المسار الاحتياطي. يرجى تأكيد استقرار الاتصال لديكم." : "Verified the regional branch VPN tunnel and restored the redundant route."}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
                    <div className="flex items-center gap-1.5"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-2)]"><Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /></span><Badge tone="neutral">{lang === "ar" ? "رد عام للمستفيد" : "Public reply"}</Badge></div>
                    <div className="flex items-center gap-1.5"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-2)]"><Mic className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /></span><span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--on-primary)]"><ArrowUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></span></div>
                  </div>
                </div>
                <div className="rounded-[var(--radius-14)] border border-[var(--internal-border)] bg-[var(--internal-bg)] p-3 shadow-[var(--shadow-e1)]">
                  <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--internal-text)]"><Lock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" /><span>ملاحظة داخلية · Internal note</span></div>
                  <p className="text-[14px] text-[var(--text)] leading-[1.6]" dir="auto">{lang === "ar" ? "مرجع الخزنة للشهادة الجديدة محفوظ تحت VAULT-TLS-2026؛ لا يُرسل للمستفيد." : "Vault reference stored under VAULT-TLS-2026; visible to IT staff only."}</p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-[var(--radius-14)] border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 shadow-[var(--shadow-e1)]">
                  <div className="flex items-center gap-2.5">
                    <span className="ig-record-dot h-2.5 w-2.5 rounded-full bg-[var(--danger)]" aria-hidden="true" />
                    <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--text)]" dir="ltr">00:24</span>
                    <div className="flex items-center gap-1 h-5" aria-hidden="true">{[8, 14, 18, 11, 16, 20, 12, 9, 15, 19, 10, 13].map((h, i) => (<span key={i} className="w-[2.5px] rounded-full bg-[var(--primary)]" style={{ height: `${h}px` }} />))}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-2)]"><X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /></span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--on-primary)]"><Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><div><CardTitle>{lang === "ar" ? "تعيين المسؤول (Combobox)" : "Assignment Popover"}</CardTitle><CardDescription>{lang === "ar" ? "سعة الفريق والمهارات" : "Capacity & skills"}</CardDescription></div></CardHeader>
                <CardContent className="pt-4">
                  <Combobox ariaLabel={lang === "ar" ? "تعيين مسؤول التذكرة" : "Assign ticket owner"} value={assignee} onChange={(val, meta) => { const prev = assignee; setAssignee(val); const chosen = ASSIGNEE_OPTIONS.find((o) => o.value === val); toast.success(lang === "ar" ? `تم التعيين إلى ${chosen?.label || val}${meta?.override ? " (تجاوز السعة)" : ""}` : `Assigned to ${chosen?.label || val}`, undefined, { label: lang === "ar" ? "تراجع" : "Undo", onClick: () => setAssignee(prev) }); }} options={ASSIGNEE_OPTIONS} triggerClassName="w-full" quickActions={[{ id: "assign-me", label: lang === "ar" ? "تعيين لي" : "Assign to me", shortcut: "A", icon: <UserCheck className="h-4 w-4" strokeWidth={1.5} />, onSelect: () => setAssignee("u-sultan") }, { id: "auto-assign", label: lang === "ar" ? "توزيع تلقائي بالقواعد" : "Auto-assign via rules", icon: <Shuffle className="h-4 w-4" strokeWidth={1.5} />, onSelect: () => setAssignee("u-noura") }]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{lang === "ar" ? "بطاقة كانبان" : "Kanban Card"}</CardTitle></CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div role="button" tabIndex={0} aria-pressed={kanbanPicked} onClick={() => setKanbanPicked((p) => !p)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setKanbanPicked((p) => !p); } }} className={`rounded-[var(--radius-10)] border p-3 text-start cursor-pointer focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${kanbanPicked ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[var(--shadow-e2)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"}`}>
                    <div className="flex items-center justify-between gap-2"><bdi className="font-mono text-[11px] font-medium text-[var(--text-3)]">TSK-0412</bdi><Badge tone="danger" icon={<AlertCircle className="h-3 w-3" strokeWidth={1.5} />}>{lang === "ar" ? "متأخرة · أمس" : "Overdue"}</Badge></div>
                    <p className="mt-1.5 text-[13px] font-semibold text-[var(--text)] leading-[1.45]">{lang === "ar" ? "استبدال شهادة خادم البريد وتحديث سجل DNS" : "Replace mail relay TLS cert & DNS"}</p>
                    <div className="mt-3 flex items-center justify-between gap-2"><div className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-2)] tabular-nums"><CheckSquare className="h-3.5 w-3.5 text-[var(--primary-text)]" strokeWidth={1.5} aria-hidden="true" /><span dir="ltr">3/5</span></div><AvatarStack items={[{ name: "سلطان العتيبي" }, { name: "نورة القحطاني" }]} size="xs" /></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section aria-labelledby="lab-overlays" className="space-y-4">
          <h2 id="lab-overlays" className="text-[16px] font-semibold text-[var(--text)]">{lang === "ar" ? "6. النوافذ المنبثقة، التلميحات، والتنبيهات" : "6. Tooltips, Popovers, Modals & Toasts"}</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>{lang === "ar" ? "التلميحات والحوارات" : "Tooltips & Dialogs"}</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 pt-4">
                <Tooltip content={lang === "ar" ? "تلميح مختصر بتباين عالٍ" : "High-contrast token tooltip"}><Button variant="secondary" size="sm">{lang === "ar" ? "مرّر للتلميح" : "Tooltip"}</Button></Tooltip>
                <Popover trigger={<Button variant="secondary" size="sm">{lang === "ar" ? "قائمة منبثقة" : "Popover"}</Button>}>
                  {({ close }) => (<div className="space-y-2.5"><div className="text-[13px] font-semibold text-[var(--text)]">{lang === "ar" ? "إعداد سريع" : "Quick Setting"}</div><p className="text-[12px] text-[var(--text-2)]">{lang === "ar" ? "ظل e2 وحافة 10px وتغلق بزر Esc." : "Elevation e2, 10px radius, Esc dismiss."}</p><Button size="sm" variant="primary" onClick={close}>{lang === "ar" ? "حسناً" : "Done"}</Button></div>)}
                </Popover>
                <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>{lang === "ar" ? "فتح نافذة" : "Modal"}</Button>
                <Button variant="danger-ghost" size="sm" onClick={() => setConfirmOpen(true)}>{lang === "ar" ? "تأكيد حذف" : "Confirm Delete"}</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{lang === "ar" ? "تنبيهات مع إجراء تراجع" : "Toast Banners"}</CardTitle></CardHeader>
              <CardContent className="space-y-2.5 pt-4">
                <ToastBanner variant="success" title={lang === "ar" ? "تم نقل التذكرة" : "Ticket reassigned"} message={lang === "ar" ? "تم التعيين إلى سلطان العتيبي." : "Reassigned to Sultan Al-Otaibi."} actionLabel={lang === "ar" ? "تراجع" : "Undo"} onAction={() => {}} />
                <ToastBanner variant="error" message={lang === "ar" ? "انتقال غير مسموح وفق مصفوفة سير العمل (409)." : "Transition rejected (409)."} />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <CardSkeleton lines={2} />
              <Card padding="none"><EmptyState compact title={lang === "ar" ? "لا توجد تذاكر متأخرة" : "No overdue tickets"} description={lang === "ar" ? "جميع التذاكر ضمن اتفاقية مستوى الخدمة." : "All open tickets within SLA."} action={<Button size="sm" variant="secondary" leadingIcon={<Send className="h-3.5 w-3.5" strokeWidth={1.5} />}>{lang === "ar" ? "تحديث" : "Refresh"}</Button>} /></Card>
            </div>
          </div>
        </section>

        <section aria-labelledby="lab-table" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="lab-table" className="text-[16px] font-semibold text-[var(--text)]">{lang === "ar" ? "7. الجدول المعياري (كثافة 44/36px، الأعمدة، عرض افتراضي >200 صف)" : "7. Enterprise DataTable"}</h2>
            <SegmentedControl size="sm" ariaLabel={lang === "ar" ? "حالة جدول الاختبار" : "Table demo state"} value={tableState} onChange={setTableState} options={[{ value: "data", label: lang === "ar" ? "عادي (6)" : "Normal (6)" }, { value: "virtualized", label: lang === "ar" ? "افتراضي (250)" : "Virtualized (250)" }, { value: "loading", label: lang === "ar" ? "تحميل" : "Loading" }, { value: "empty", label: lang === "ar" ? "فارغ" : "Empty" }, { value: "error", label: lang === "ar" ? "خطأ" : "Error" }]} />
          </div>
          <DataTable caption={lang === "ar" ? "جدول تذاكر الدعم التجريبي" : "Sample help desk tickets table"} data={tableState === "empty" ? [] : rows} columns={columns} rowKey={(r) => r.id} loading={tableState === "loading"} error={tableState === "error" ? (lang === "ar" ? "تعذّر الوصول لخادم البيانات." : "Failed to reach API.") : null} onRetry={() => setTableState("data")} renderRowActions={(r) => <Button variant="ghost" size="sm" onClick={() => toast.info(`${lang === "ar" ? "فتح" : "Open"} ${r.ref}`)}>{lang === "ar" ? "عرض" : "View"}</Button>} />
        </section>
      </main>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={lang === "ar" ? "إنشاء قاعدة توزيع جديدة" : "Create assignment rule"} footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button><Button variant="primary" onClick={() => setModalOpen(false)}>{lang === "ar" ? "حفظ القاعدة" : "Save"}</Button></>}>
        <FormField label={lang === "ar" ? "اسم القاعدة" : "Rule name"} required htmlFor="modal-rule-name"><Input id="modal-rule-name" placeholder={lang === "ar" ? "مثال: تذاكر الشبكات العاجلة" : "e.g. Urgent network tickets"} /></FormField>
      </Modal>
      <ConfirmDialog isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => setConfirmOpen(false)} title={lang === "ar" ? "تأكيد حذف سياسة SLA" : "Confirm deletion"} description={lang === "ar" ? "هذا الإجراء غير قابل للتراجع." : "This action is irreversible."} confirmLabel={lang === "ar" ? "حذف نهائي" : "Delete"} destructive requireTypedConfirmation="SLA-CRITICAL" />
    </div>
  );
}
