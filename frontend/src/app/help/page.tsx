"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import {
  BookOpen,
  Search,
  Compass,
  HelpCircle,
  Wrench,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  Info,
} from "lucide-react";

interface TutorialItem {
  id: string;
  category: string;
  titleAr: string;
  titleEn: string;
  route: string;
  roles: string[];
  summary: string;
  steps: string[];
}

const TUTORIALS: TutorialItem[] = [
  {
    id: "install-setup",
    category: "البدء والأمان",
    titleAr: "التثبيت والتهيئة الأولية الآمنة",
    titleEn: "Installation & First-Run Setup",
    route: "/setup",
    roles: ["Super Admin"],
    summary: "خطوات تشغيل النظام لأول مرة وإنشاء حساب مدير النظام العام دون بيانات تجريبية أو كلمات مرور افتراضية.",
    steps: [
      "شغّل حزمة النظام عبر المثبّت أو Docker Compose بعد التأكد من توليد مفاتيح SECRET_KEY وكلمات مرور قاعدة البيانات عشوائياً.",
      "عند فتح النظام لأول مرة، يتم توجيهك تلقائياً إلى شاشة التهيئة (/setup).",
      "اقرأ إشعار الترخيص وحقوق النشر ووافق عليه، ثم أدخل الاسم الكامل، اسم المستخدم، وكلمة مرور قوية (12 خانة فأكثر).",
      "بعد الحفظ، يُغلق مسار التهيئة الأولية نهائياً وتنتقل إلى شاشة تسجيل الدخول (/login).",
    ],
  },
  {
    id: "login-rbac",
    category: "البدء والأمان",
    titleAr: "تسجيل الدخول والصلاحيات",
    titleEn: "Authentication & RBAC",
    route: "/login",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"],
    summary: "تسجيل الدخول الآمن عبر Argon2id والتحكم بالوصول المعتمد على الأدوار وعزل الشركات.",
    steps: [
      "أدخل اسم المستخدم وكلمة المرور في شاشة الدخول (/login).",
      "اختر الشركة النشطة من مبدّل الشركات في الشريط العلوي لعزل البيانات المعروضة.",
      "يمكن تغيير كلمة المرور في أي وقت من بطاقة تغيير كلمة المرور في الإعدادات (/settings).",
    ],
  },
  {
    id: "dashboard",
    category: "الوحدات الأساسية",
    titleAr: "لوحة المتابعة التنفيذية",
    titleEn: "Dashboard & KPIs",
    route: "/",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"],
    summary: "قراءة مؤشرات الأصول، التذاكر، المهام، والتنبيهات الفورية.",
    steps: [
      "استعرض مؤشرات الأداء العلوية (الأصول والعهد، التذاكر، المهام قيد التنفيذ، المتأخرة).",
      "استخدم بطاقة الإجراءات السريعة للوصول المباشر لإضافة أصل، فتح تذكرة، إضافة موظف، أو إسناد مهمة.",
      "بدّل بين توزيع الموظفين والتذاكر في الرسوم البيانية التفاعلية.",
    ],
  },
  {
    id: "companies-branches",
    category: "الوحدات الأساسية",
    titleAr: "الشركات والفروع الخمسة",
    titleEn: "Companies & Branches",
    route: "/companies",
    roles: ["Super Admin", "Company Admin", "IT Manager", "Auditor"],
    summary: "إدارة الشركة الرئيسية والشركات التابعة والفروع الخمسة المعتمدة (مخرج 17، مخرج 18، العليا، الدمام، جدة).",
    steps: [
      "اختر الشركة من شجرة الشركات في الجهة اليمنى لعرض فروعها وأقسامها.",
      "انتقل بين تبويبات الفروع (5)، معلومات الشركة، الأقسام، والشركات التابعة.",
      "استخدم زر إضافة فرع أو تعديل لتحديث بيانات الموقع أو حالة الفرع.",
    ],
  },
  {
    id: "employees",
    category: "الوحدات الأساسية",
    titleAr: "الموظفون والملف الشامل 360°",
    titleEn: "Employees & 360° Profile",
    route: "/employees",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Auditor"],
    summary: "تسجيل الموظفين وربطهم بالشركة والفرع والأصول والاشتراكات و Telegram.",
    steps: [
      "أضف موظفاً جديداً وحدد الشركة والفرع والمسمى الوظيفي.",
      "اضغط على زر (ملف 360°) لفتح سجل العهد والمهام وحالة الربط مع Telegram.",
      "استخدم شريط البحث والمرشحات لتصفية الموظفين حسب الحالة أو الفرع أو تصدير CSV.",
    ],
  },
  {
    id: "assets-custody",
    category: "العمليات التقنية",
    titleAr: "الأصول والعهد التقنية",
    titleEn: "Technical Assets & Custody",
    route: "/assets",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Auditor"],
    summary: "تتبع الأجهزة، تسليم واسترجاع العهد، رموز QR، وسندات الاستلام.",
    steps: [
      "سجّل أصلاً تقنياً جديداً مع الرقم التسلسلي (S/N) والنوع والفرع.",
      "اضغط (تسليم كعهدة) لربط الجهاز بموظف وتوثيق تاريخ التسليم.",
      "استخدم (استرجاع العهدة) عند إخلاء الطرف أو نقل الجهاز، واطبع رمز QR أو سجل العهد.",
    ],
  },
  {
    id: "subscriptions",
    category: "العمليات التقنية",
    titleAr: "الاشتراكات ومشاركة التراخيص",
    titleEn: "Subscriptions & Seat Allocation",
    route: "/subscriptions",
    roles: ["Super Admin", "Company Admin", "IT Manager", "Auditor"],
    summary: "إدارة اشتراكات SaaS والنطاقات وتوزيع المقاعد وتنبيهات التجديد.",
    steps: [
      "أضف اشتراكاً جديداً وحدد عدد المقاعد (Seat Limit) والتكلفة الشهرية وتاريخ التجديد.",
      "اضغط (المقاعد) لإسناد التراخيص للموظفين ضمن الحد الأقصى المسموح.",
      "راقب بطاقة (أهم التنبيهات) لمتابعة الاشتراكات المقاربة للانتهاء.",
    ],
  },
  {
    id: "helpdesk",
    category: "الدعم والمهام",
    titleAr: "مكتب المساعدة والتذاكر",
    titleEn: "Help Desk & Ticketing",
    route: "/tickets",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"],
    summary: "فتح التذاكر، تعيين الفني المسؤول، متابعة SLA، وتحويل التذكرة لمهمة.",
    steps: [
      "اضغط (فتح تذكرة دعم جديدة) وحدد العنوان والتصنيف والأولوية والأصل المرتبط.",
      "من نافذة (معاينة وإدارة) يمكنك تحديث الحالة، إضافة التعليقات، أو تحويل التذكرة إلى مهمة تشغيلية.",
    ],
  },
  {
    id: "tasks",
    category: "الدعم والمهام",
    titleAr: "المهام والمواعيد النهائية",
    titleEn: "Tasks & Deadlines",
    route: "/tasks",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"],
    summary: "إسناد المهام، قبول التنفيذ، إرسال المراجعة، والاعتماد مع إشعارات Telegram.",
    steps: [
      "استخدم تبويب (جميع المهام) أو (المهام المسندة إليّ) لمتابعة التكليفات.",
      "يؤكد الفني استلام المهمة عبر (قبول المهمة) ثم يرفعها للمراجعة بعد الإنجاز.",
      "يعتمد مدير تقنية المعلومات المهمة عبر (مراجعة واعتماد) لإغلاقها وتحديث سجل الإنجاز.",
    ],
  },
  {
    id: "reports",
    category: "التقارير والإدارة",
    titleAr: "التقارير والتصدير والاستيراد",
    titleEn: "Reports, PDF & Excel/CSV",
    route: "/reports",
    roles: ["Super Admin", "Company Admin", "IT Manager", "Auditor"],
    summary: "إصدار تقارير الأصول والعهد والتذاكر والاشتراكات بصيغ Excel/CSV و PDF.",
    steps: [
      "اختر الوحدة المطلوبة من كتالوج التقارير واضغط (تصدير إلى Excel) أو (معاينة وطباعة PDF).",
      "للمصرح لهم، يمكن استيراد جداول CSV عبر زر (استيراد بيانات) مع التحقق المسبق (Dry Run).",
    ],
  },
  {
    id: "settings-themes",
    category: "التقارير والإدارة",
    titleAr: "الإعدادات ومعرض الهويات البصرية",
    titleEn: "Settings, Themes & DR Backup",
    route: "/settings",
    roles: ["Super Admin", "Company Admin", "IT Manager", "IT Technician", "Employee", "Auditor"],
    summary: "تغيير السمة الكاملة (6 هويات بصرية × فاتح/داكن/تلقائي)، إدارة Telegram، والنسخ الاحتياطي.",
    steps: [
      "من قسم (مظهر النظام) اختر وضع الإضاءة (فاتح، داكن، تلقائي) وأحد الهويات الست من معرض الهويات البصرية.",
      "للمدير العام: راجع حالة قاعدة البيانات ومركز صيانة DR (/settings/system) لأخذ نسخ احتياطية متحققة بـ SHA-256.",
    ],
  },
];

const FAQS = [
  {
    q: "كيف أغير هوية الألوان والوضع الليلي في كامل النظام؟",
    a: "انتقل إلى الإعدادات (/settings) ثم بطاقة (مظهر النظام)، واختر وضع الإضاءة (فاتح/داكن/تلقائي) ثم اختر إحدى الهويات الست من معرض الهويات البصرية. يتم التطبيق والحفظ فوراً دون إعادة تحميل.",
  },
  {
    q: "لماذا لا يظهر زر صيانة DR أو النسخ الاحتياطي لبعض المستخدمين؟",
    a: "إدارة النسخ الاحتياطي والاستعادة وإعدادات التكاملات المتقدمة مقيدة بصلاحية (Super Admin) فقط تطبيقاً لمبدأ أقل صلاحية (Least Privilege).",
  },
  {
    q: "كيف أربط حساب موظف بإشعارات Telegram؟",
    a: "افتح صفحة الموظفين (/employees)، اختر الموظف ثم (ملف 360°) أو نافذة الربط، وأنشئ رمز الربط الآمن ليرسله الموظف إلى البوت المعتمد.",
  },
  {
    q: "هل يتم حذف البيانات عند ترقية النظام أو إعادة التثبيت؟",
    a: "لا. مسار الترقية والإصلاح يحافظ على جميع السجلات، ويأخذ نسخة احتياطية قبل تطبيق أي ترقية متوافقة، ولا ينفذ إعادة ضبط المصنع تلقائياً أبداً.",
  },
];

const TROUBLESHOOTING = [
  {
    issue: "تعذر تسجيل الدخول بعد 5 محاولات خاطئة",
    solution: "يقفل النظام الحساب مؤقتاً لمدة 15 دقيقة لحمايته من هجمات التخمين. انتظر انتهاء المهلة أو راجع مدير النظام.",
  },
  {
    issue: "حالة Telegram تظهر (غير متصل)",
    solution: "تحقق من تفعيل تكامل Telegram وصحة Bot Token في صفحة الإعدادات المتقدمة (/settings/integrations).",
  },
  {
    issue: "ظهور شاشة التهيئة الأولية (/setup) عند التشغيل الأول",
    solution: "هذا سلوك أمني مقصود في التثبيت النظيف لعدم وجود حسابات افتراضية؛ أنشئ حساب مدير النظام الأول لمرة واحدة لإغلاق الشاشة نهائياً.",
  },
];

const TOUR_STEPS = [
  {
    title: "مرحباً بك في Investor Gate OS",
    desc: "منصة إدارة عمليات تقنية المعلومات والأصول متعددة الشركات والمنصات. هذه الجولة المختصرة تعرفك على عناصر الواجهة الأساسية.",
  },
  {
    title: "الشريط الجانبي ومبدّل الشركة",
    desc: "يتيح لك الشريط الجانبي الوصول للوحدات التسع المعتمدة، بينما يضمن مبدّل الشركة في الأعلى عزل البيانات لكل شركة معتمدة.",
  },
  {
    title: "البحث السريع (Ctrl+K) وحالة Telegram",
    desc: "يمكنك البحث الفوري عن الأصول والتذاكر والموظفين من شريط البحث العلوي، ومتابعة اتصال Telegram من الشارة الحية.",
  },
  {
    title: "معرض الهويات البصرية (6 سمات متكاملة)",
    desc: "من الإعدادات (/settings)، يمكنك التبديل الفوري بين 6 هويات احترافية تدعم الوضع الفاتح اللؤلؤي والوضع الداكن الفخم.",
  },
];

export default function HelpLearningCenterPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [onlyMyRole, setOnlyMyRole] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const userRoles = useMemo(() => {
    if (user?.is_superadmin) return ["Super Admin"];
    return user?.roles && user.roles.length > 0 ? user.roles : ["Employee"];
  }, [user]);

  const filteredTutorials = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TUTORIALS.filter((t) => {
      const roleAllowed = !onlyMyRole || user?.is_superadmin || t.roles.some((r) => userRoles.includes(r));
      if (!roleAllowed) return false;
      if (!q) return true;
      return (
        t.titleAr.toLowerCase().includes(q) ||
        t.titleEn.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.steps.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, onlyMyRole, user?.is_superadmin, userRoles]);

  const finishTour = () => {
    setTourOpen(false);
    setTourStep(0);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("ig_onboarding_completed", "true");
      } catch {}
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text)] tracking-tight">
                مركز المساعدة والتعلّم (Learning Center)
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-3)] mt-0.5">
                أدلة التشغيل العملية، الجولة الإرشادية، الأسئلة الشائعة، واستكشاف الأعطال
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTourStep(0);
                setTourOpen(true);
              }}
              className="h-10 px-4 rounded-xl bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Compass className="w-4 h-4" />
              <span>بدء الجولة الإرشادية</span>
            </button>
            <Link
              href="/about"
              className="h-10 px-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--text)] inline-flex items-center gap-2 hover:border-[#2563EB]"
            >
              <Info className="w-4 h-4 text-[#2563EB]" />
              <span>حول النظام والمطور</span>
            </Link>
          </div>
        </div>

        {/* Guided Onboarding Banner */}
        {tourOpen && (
          <section
            role="dialog"
            aria-label="الجولة الإرشادية التفاعلية"
            className="rounded-2xl bg-[var(--surface)] border-2 border-[#2563EB] p-5 shadow-md space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2563EB]">
                <Compass className="w-4 h-4" />
                <span>
                  الخطوة {tourStep + 1} من {TOUR_STEPS.length}
                </span>
              </div>
              <button
                type="button"
                onClick={finishTour}
                aria-label="إغلاق الجولة"
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">{TOUR_STEPS[tourStep].title}</h2>
              <p className="text-xs text-[var(--text-2)] mt-1 leading-relaxed">{TOUR_STEPS[tourStep].desc}</p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={tourStep === 0}
                onClick={() => setTourStep((s) => Math.max(0, s - 1))}
                className="h-9 px-3 rounded-lg border border-[var(--border)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                <span>السابق</span>
              </button>
              {tourStep < TOUR_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setTourStep((s) => s + 1)}
                  className="h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishTour}
                  className="h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>إنهاء الجولة</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* Search & RBAC Filter Bar */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-3.5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-3)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="ابحث في الأدلة التعليمية والأسئلة الشائعة"
              placeholder="ابحث عن وحدة، إجراء، أو مصطلح (مثال: Custody, QR, Telegram, Backup)..."
              className="w-full h-10 ps-9 pe-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs outline-none focus:border-[#2563EB]"
            />
          </div>
          <button
            type="button"
            aria-pressed={onlyMyRole}
            onClick={() => setOnlyMyRole((v) => !v)}
            className={`h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer ${
              onlyMyRole
                ? "border-[#2563EB] bg-emerald-50 text-[#1D4ED8]"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{onlyMyRole ? "أدلة صلاحيتي الحالية فقط" : "عرض جميع الأدلة"}</span>
          </button>
        </div>

        {/* Tutorials Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTutorials.map((tut) => (
            <article
              key={tut.id}
              className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 shadow-xs flex flex-col justify-between gap-3"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-[#1D4ED8] text-[10px] font-bold mb-1.5">
                      {tut.category}
                    </span>
                    <h2 className="text-sm font-bold text-[var(--text)]">{tut.titleAr}</h2>
                    <div className="text-[11px] font-mono text-[var(--text-3)]" dir="ltr">
                      {tut.titleEn}
                    </div>
                  </div>
                  <Link
                    href={tut.route}
                    className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] font-bold text-[#2563EB] hover:border-[#2563EB] shrink-0"
                  >
                    فتح الشاشة ←
                  </Link>
                </div>

                <p className="text-xs text-[var(--text-2)] leading-relaxed">{tut.summary}</p>

                <ol className="space-y-1.5 text-xs text-[var(--text-2)] bg-[var(--surface-2)] rounded-xl p-3 border border-[var(--border)] list-decimal list-inside">
                  {tut.steps.map((step, i) => (
                    <li key={i} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>

        {/* FAQs & Troubleshooting */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--border)]">
              <HelpCircle className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-[var(--text)]">الأسئلة الشائعة (FAQs)</h2>
            </div>
            <div className="space-y-2.5">
              {FAQS.map((f, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] space-y-1">
                  <div className="text-xs font-bold text-[var(--text)]">{f.q}</div>
                  <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--border)]">
              <Wrench className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-[var(--text)]">استكشاف الأعطال وإصلاحها (Troubleshooting)</h2>
            </div>
            <div className="space-y-2.5">
              {TROUBLESHOOTING.map((tr, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] space-y-1">
                  <div className="text-xs font-bold text-[var(--text)]">{tr.issue}</div>
                  <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{tr.solution}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
