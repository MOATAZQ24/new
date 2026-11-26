/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useEffect, useMemo } from "react";
import Stepper from "@/components/ui/Stepper";
import {
  Laptop,
  Wifi,
  Shield,
  Layers,
  Mail,
  HelpCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Search,
  Mic,
  RotateCcw,
  User,
  Cpu,
  FileText,
  Paperclip,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import VoiceTaskRecorder, { type VoiceRecordingResult } from "@/components/tasks/VoiceTaskRecorder";
import { ServicePriorityBadge, getCategoryIcon } from "./ServiceDeskTokens";

export interface CatalogItem {
  id: string;
  category: string;
  name_ar: string;
  name_en?: string;
  description_ar?: string;
  icon?: string;
  default_priority: string;
  estimated_duration_hours?: number;
  requires_approval: boolean;
  approval_type?: string;
}

interface AdaptiveTicketWizardProps {
  onSuccess: (ticketId: string) => void;
  onCancel: () => void;
  initialCatalogItemId?: string;
}

const WIZARD_STEPS = [
  { id: "category", title: "1. تصنيف المشكلة", description: "اختر تصنيف البلاغ الفني" },
  { id: "description", title: "2. تفاصيل ووصف البلاغ", description: "شرح المشكلة، التسجيل الصوتي، والأصل" },
  { id: "review", title: "3. المراجعة والإرسال", description: "التأكيد النهائي وتتبع البلاغ" },
];

const STANDARD_CATEGORIES = [
  {
    id: "Hardware",
    name_ar: "أجهزة وعتاد",
    description: "حواسيب، شاشات، طابعات، ماسحات ضوئية، ملحقات مكتبية",
    icon: Laptop,
    color: "from-blue-500/10 to-indigo-500/10 text-blue-600 border-blue-200",
  },
  {
    id: "Software",
    name_ar: "برمجيات وأنظمة",
    description: "تطبيقات الأوفيس، أنظمة التشغيل، برامج التصميم، أخطاء الأنظمة",
    icon: Layers,
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 border-emerald-200",
  },
  {
    id: "Network",
    name_ar: "شبكات واتصالات",
    description: "انقطاع الإنترنت، شبكة واي فاي، الاتصال المحلي، هواتف IP",
    icon: Wifi,
    color: "from-cyan-500/10 to-blue-500/10 text-cyan-600 border-cyan-200",
  },
  {
    id: "Access",
    name_ar: "صلاحيات وأمان",
    description: "إعادة تعيين كلمة المرور، صلاحيات المجلدات، حسابات الموظفين، VPN",
    icon: Shield,
    color: "from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-200",
  },
  {
    id: "Email",
    name_ar: "البريد الإلكتروني",
    description: "مشاكل إرسال/استقبال، تكوين البريد، سعة الصندوق، الرسائل المزعجة",
    icon: Mail,
    color: "from-purple-500/10 to-violet-500/10 text-purple-600 border-purple-200",
  },
  {
    id: "General",
    name_ar: "عام واستفسارات",
    description: "استشارات تقنية، طلب نقل مكتب، تدريب تقني، بلاغات أخرى",
    icon: HelpCircle,
    color: "from-rose-500/10 to-pink-500/10 text-rose-600 border-rose-200",
  },
];

const DRAFT_STORAGE_KEY = "igos_service_desk_wizard_draft";

export default function AdaptiveTicketWizard({
  onSuccess,
  onCancel,
  initialCatalogItemId,
}: AdaptiveTicketWizardProps) {
  const { currentCompany, user } = useAuth();
  const toast = useToast();

  const [savedDraft] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeStep, setActiveStep] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => savedDraft?.selectedCategory || "Hardware");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);

  // Dependencies
  const [employees, setEmployees] = useState<{ id: string; full_name: string; email?: string }[]>([]);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string; assigned_to_id?: string }[]>([]);

  // Form Fields
  const [requesterId, setRequesterId] = useState<string>("");
  const [priority, setPriority] = useState<string>(() => savedDraft?.priority || "Medium");
  const [selectedAssetId, setSelectedAssetId] = useState<string>(() => savedDraft?.selectedAssetId || "");
  const [issueTitle, setIssueTitle] = useState<string>(() => savedDraft?.issueTitle || "");
  const [issueDescription, setIssueDescription] = useState<string>(() => savedDraft?.issueDescription || "");
  const [voiceResult, setVoiceResult] = useState<VoiceRecordingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasDraft, setHasDraft] = useState(() => Boolean(savedDraft?.issueTitle || savedDraft?.issueDescription));

  // Load catalog items and dependencies
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoadingCatalog(true);
        const [catRes, empRes, astRes] = await Promise.all([
          api.get<CatalogItem[]>("/tickets/catalog").catch(() => ({ data: [] })),
          api.get<{ id: string; full_name: string; email?: string }[]>("/employees?per_page=100").catch(() => ({ data: [] })),
          api.get<{ id: string; asset_name: string; asset_code: string; assigned_to_id?: string }[]>("/assets?per_page=100").catch(() => ({ data: [] })),
        ]);

        if (!mounted) return;
        const items = catRes.data || [];
        setCatalogItems(items);
        setEmployees(empRes.data || []);
        setAssets(astRes.data || []);

        if (initialCatalogItemId) {
          const matched = items.find((it) => it.id === initialCatalogItemId);
          if (matched) {
            setSelectedCatalogItem(matched);
            setSelectedCategory(matched.category || "Hardware");
            setPriority(matched.default_priority || "Medium");
            setIssueTitle(matched.name_ar);
          }
        }
      } catch (err) {
        console.error("Failed to load service desk wizard data", err);
      } finally {
        if (mounted) setLoadingCatalog(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [initialCatalogItemId]);



  // Auto-save draft
  useEffect(() => {
    try {
      if (issueTitle || issueDescription) {
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            issueTitle,
            issueDescription,
            selectedCategory,
            priority,
            selectedAssetId,
            catalogItemId: selectedCatalogItem?.id,
          })
        );
      }
    } catch {
      // ignore
    }
  }, [issueTitle, issueDescription, selectedCategory, priority, selectedAssetId, selectedCatalogItem]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setIssueTitle("");
    setIssueDescription("");
    setVoiceResult(null);
    setHasDraft(false);
    toast.success("تم مسح المسودة المحفوظة");
  };

  // Filter catalog items by selected category
  const categoryCatalogItems = useMemo(() => {
    return catalogItems.filter((it) => it.category.toLowerCase() === selectedCategory.toLowerCase());
  }, [catalogItems, selectedCategory]);

  // Assets filtered by employee
  const relevantAssets = useMemo(() => {
    if (!requesterId) return assets;
    const userAssets = assets.filter((a) => a.assigned_to_id === requesterId);
    return userAssets.length > 0 ? userAssets : assets;
  }, [assets, requesterId]);

  // Step validation
  const canAdvance = useMemo(() => {
    if (activeStep === 0) return !!selectedCategory;
    if (activeStep === 1) return issueTitle.trim().length > 0;
    return true;
  }, [activeStep, selectedCategory, issueTitle]);

  // Handle final submit
  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      // Upload voice note if present
      let voiceUrl: string | null = null;
      if (voiceResult?.blob) {
        const voiceFormData = new FormData();
        voiceFormData.append("file", voiceResult.blob, "ticket_voice.webm");
        const uploadRes = await fetch("/api/v1/tickets/voice/upload", {
          method: "POST",
          body: voiceFormData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        if (uploadRes.ok) {
          const upJson = await uploadRes.json();
          voiceUrl = upJson.data?.voice_note_url || null;
        }
      }

      const payload = {
        company_id: currentCompany?.id,
        catalog_item_id: selectedCatalogItem?.id || null,
        issue_title: issueTitle.trim(),
        issue_description: issueDescription.trim() || issueTitle.trim(),
        category: selectedCategory || "Hardware",
        priority: priority,
        ticket_type: selectedCatalogItem?.requires_approval ? "Service_Request" : "Incident",
        tier: "L1",
        voice_note_url: voiceUrl,
        requester_id: requesterId || null,
        related_asset_id: selectedAssetId || null,
      };

      const res = await api.post<{ id: string }>("/tickets", payload);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success("تم تسجيل طلب الخدمة وإدراجه في مسار الدعم الفني بنجاح!");
      onSuccess(res.data?.id || "");
    } catch (err) {
      console.error("Failed to submit service request", err);
      toast.error(err instanceof Error ? err.message : "فشل تقديم طلب الخدمة");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border/80 rounded-3xl shadow-xl overflow-hidden max-w-4xl mx-auto flex flex-col">
      {/* Wizard Header with RTL Stepper */}
      <div className="bg-muted/40 border-b border-border/60 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-[var(--radius-8)] bg-[var(--primary-soft)] text-[var(--primary-text)] flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-foreground">
                معالج طلبات الدعم الفني
              </h3>
              <p className="text-xs text-muted-foreground">
                تجربة سلسة في 3 خطوات بسيطة لتقديم ومتابعة بلاغاتك الفنية
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasDraft && (
              <button
                type="button"
                onClick={clearDraft}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                title="مسح المسودة المحفوظة"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                مسح المسودة
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>

        {/* Responsive Stepper */}
        <div className="hidden sm:block">
          <Stepper
            steps={WIZARD_STEPS}
            activeStep={activeStep}
            onStepClick={(idx) => idx < activeStep && setActiveStep(idx)}
            allowStepClick={true}
          />
        </div>
        <div className="block sm:hidden">
          <Stepper steps={WIZARD_STEPS} activeStep={activeStep} variant="compact" />
        </div>
      </div>

      {/* Wizard Content Body */}
      <div className="p-4 sm:p-6 flex-1 min-h-[380px]">
        {/* =========================================================================
            STAGE 1: CATEGORY SELECTION
           ========================================================================= */}
        {activeStep === 0 && (
          <div className="space-y-5">
            <div className="text-right">
              <h4 className="text-sm font-black text-foreground mb-1">حدد تصنيف المشكلة أو الخدمة</h4>
              <p className="text-xs text-muted-foreground">
                اختر المجال الأقرب للمشكلة التي تواجهها لمساعدتنا في توجيه التذكرة للفني المختص مباشرة
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {STANDARD_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setSelectedCatalogItem(null);
                    }}
                    className={`relative p-4 rounded-2xl border transition-all text-right cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20"
                        : "bg-card border-border/70 hover:border-primary/50 hover:shadow-xs"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center border`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        {isSelected && (
                          <span className="text-primary font-bold flex items-center gap-1 text-xs">
                            <CheckCircle2 className="w-4 h-4" /> محدد
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-foreground mb-1">{cat.name_ar}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {cat.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Catalog Items for this category if available */}
            {categoryCatalogItems.length > 0 && (
              <div className="pt-4 border-t border-border/60">
                <span className="text-xs font-bold text-foreground block mb-2 text-right">
                  خدمات شائعة في هذا التصنيف (اختياري):
                </span>
                <div className="flex flex-wrap gap-2">
                  {categoryCatalogItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedCatalogItem(item);
                        setIssueTitle(item.name_ar);
                        setPriority(item.default_priority || "Medium");
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        selectedCatalogItem?.id === item.id
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-muted/40 border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.name_ar}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            STAGE 2: PROBLEM DESCRIPTION & MULTIMEDIA
           ========================================================================= */}
        {activeStep === 1 && (
          <div className="space-y-4 max-w-xl mx-auto py-2 text-right">
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  {getCategoryIcon(selectedCategory, "w-4 h-4")}
                </div>
                <div>
                  <span className="text-[11px] font-bold text-primary">التصنيف المختار:</span>
                  <div className="text-xs font-black text-foreground">
                    {STANDARD_CATEGORIES.find((c) => c.id === selectedCategory)?.name_ar || selectedCategory}
                    {selectedCatalogItem && ` — ${selectedCatalogItem.name_ar}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep(0)}
                className="text-xs text-primary hover:underline font-bold"
              >
                تغيير
              </button>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                عنوان المشكلة أو الطلب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="مثال: انقطاع الاتصال بالطابعة، عطل في الشاشة الرئيسية"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none font-medium"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                الوصف التفصيلي للمشكلة
              </label>
              <textarea
                rows={3}
                placeholder="اشرح بدقة ما حدث، وما هي الخطوات أو البرامج التي كنت تستخدمها عند ظهور العطل..."
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none leading-relaxed"
              />
            </div>

            {/* Requester & Priority Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Requester */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-primary" /> صاحب الطلب
                </label>
                <select
                  value={requesterId}
                  onChange={(e) => setRequesterId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">أنا (المستخدم الحالي)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-primary" /> مستوى الأهمية
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="Urgent">عاجل جداً — توقف كلي</option>
                  <option value="High">مرتفع — يعيق العمل الأساسي</option>
                  <option value="Medium">متوسط — تأثير جزئي</option>
                  <option value="Low">منخفض — استفسار أو طلب بسيط</option>
                </select>
              </div>
            </div>

            {/* Related Asset */}
            <div className="space-y-1 pt-1">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-primary" /> الأصل التقني المرتبط (اختياري)
              </label>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">لا يوجد أصل تقني محدد</option>
                {relevantAssets.map((ast) => (
                  <option key={ast.id} value={ast.id}>
                    {ast.asset_name} ({ast.asset_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Task Recorder */}
            <div className="pt-2">
              <label className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5 justify-end">
                <Mic className="w-3.5 h-3.5 text-primary" /> تسجيل ملاحظة صوتية سريعة للفني (اختياري)
              </label>
              <VoiceTaskRecorder onRecordingComplete={(res) => setVoiceResult(res)} />
            </div>
          </div>
        )}

        {/* =========================================================================
            STAGE 3: REVIEW & SUBMIT
           ========================================================================= */}
        {activeStep === 2 && (
          <div className="space-y-4 max-w-xl mx-auto py-2 text-right">
            <div className="text-right mb-2">
              <h4 className="text-sm font-black text-foreground">مراجعة بيانات التذكرة قبل الإرسال</h4>
              <p className="text-xs text-muted-foreground">تأكد من صحة المعلومات المدخلة لضمان سرعة الاستجابة</p>
            </div>

            <div className="bg-muted/40 border border-border/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <span className="text-xs text-muted-foreground">التصنيف:</span>
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  {getCategoryIcon(selectedCategory, "w-4 h-4 text-primary")}
                  {STANDARD_CATEGORIES.find((c) => c.id === selectedCategory)?.name_ar || selectedCategory}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <span className="text-xs text-muted-foreground">مستوى الأولوية:</span>
                <ServicePriorityBadge priority={priority} />
              </div>

              {selectedAssetId && (
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <span className="text-xs text-muted-foreground">الأصل المرتبط:</span>
                  <span className="text-xs font-bold text-foreground">
                    {assets.find((a) => a.id === selectedAssetId)?.asset_name || "أصل محدد"}
                  </span>
                </div>
              )}

              <div>
                <span className="text-xs text-muted-foreground block mb-1">عنوان البلاغ:</span>
                <p className="text-xs font-extrabold text-foreground">{issueTitle}</p>
                {issueDescription && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed bg-background/60 p-2.5 rounded-xl border border-border/40">
                    {issueDescription}
                  </p>
                )}
              </div>

              {voiceResult && (
                <div className="pt-2 flex items-center justify-between text-xs text-primary font-bold">
                  <span className="flex items-center gap-1">
                    <Mic className="w-3.5 h-3.5" /> مرفق تسجيل صوتي
                  </span>
                  <span>{Math.round(voiceResult.duration)} ثانية</span>
                </div>
              )}
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                سيتم إرسال البلاغ آلياً إلى طابور الدعم الفني وتعيين رقم مرجعي فوري للمتابعة.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Footer Controls */}
      <div className="bg-muted/40 border-t border-border/60 p-4 sm:p-5 flex items-center justify-between">
        {activeStep > 0 ? (
          <button
            type="button"
            onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-muted transition cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" /> السابق
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-muted transition cursor-pointer"
          >
            إلغاء
          </button>
        )}

        {activeStep < 2 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setActiveStep((prev) => Math.min(2, prev + 1))}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold rounded-xl bg-primary text-primary-foreground hover:opacity-95 disabled:opacity-50 transition cursor-pointer shadow-xs"
          >
            التالي <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !issueTitle.trim()}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-black rounded-xl bg-primary text-primary-foreground hover:opacity-95 disabled:opacity-50 shadow-md transition cursor-pointer"
          >
            {submitting ? (
              <span>جاري الإرسال...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>إرسال البلاغ الآن</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
