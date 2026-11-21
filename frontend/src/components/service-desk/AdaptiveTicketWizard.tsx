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
  Sparkles,
  Paperclip,
  Mic,
  RotateCcw,
  Building,
  User,
  Cpu,
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
  workflow_template?: string;
  dynamic_form_schema?: {
    fields?: Array<{
      name: string;
      label_ar: string;
      type: "text" | "select" | "radio" | "textarea" | "checkbox";
      required?: boolean;
      options?: string[];
      placeholder?: string;
    }>;
  };
}

interface AdaptiveTicketWizardProps {
  onSuccess: (ticketId: string) => void;
  onCancel: () => void;
  initialCatalogItemId?: string;
}

const WIZARD_STEPS = [
  { id: "catalog", title: "نوع الخدمة", description: "اختر نوع الطلب من دليل الخدمات" },
  { id: "context", title: "السياق والأثر", description: "بيانات الموظف ودرجة الأهمية" },
  { id: "details", title: "التفاصيل والأصول", description: "الحقول المخصصة والعتاد المرتبط" },
  { id: "multimedia", title: "الوصف والتسجيل", description: "شرح المشكلة والملاحظة الصوتية" },
  { id: "review", title: "المراجعة والإرسال", description: "تأكيد الطلب وتتبع مستوى الخدمة" },
];

const DRAFT_STORAGE_KEY = "igos_service_desk_wizard_draft";

export default function AdaptiveTicketWizard({
  onSuccess,
  onCancel,
  initialCatalogItemId,
}: AdaptiveTicketWizardProps) {
  const { currentCompany, user } = useAuth();
  const toast = useToast();

  const [activeStep, setActiveStep] = useState(0);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [catalogSearch, setCatalogSearch] = useState<string>("");

  // Dependencies
  const [employees, setEmployees] = useState<{ id: string; full_name: string; email?: string }[]>([]);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string; assigned_to_id?: string }[]>([]);

  // Form Fields
  const [requesterId, setRequesterId] = useState<string>("");
  const [priority, setPriority] = useState<string>("Medium");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [customFieldsValues, setCustomFieldsValues] = useState<Record<string, any>>({});
  const [issueTitle, setIssueTitle] = useState<string>("");
  const [issueDescription, setIssueDescription] = useState<string>("");
  const [voiceResult, setVoiceResult] = useState<VoiceRecordingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load catalog items and dependencies
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoadingCatalog(true);
        const [catRes, empRes, astRes] = await Promise.all([
          api.get<CatalogItem[]>("/tickets/catalog"),
          api.get<{ id: string; full_name: string; email?: string }[]>("/employees?per_page=100"),
          api.get<{ id: string; asset_name: string; asset_code: string; assigned_to_id?: string }[]>("/assets?per_page=100"),
        ]);

        if (!mounted) return;
        const items = catRes.data || [];
        setCatalogItems(items);
        setEmployees(empRes.data || []);
        setAssets(astRes.data || []);

        // Preselect initial catalog item if passed
        if (initialCatalogItemId) {
          const matched = items.find((it) => it.id === initialCatalogItemId);
          if (matched) {
            setSelectedCatalogItem(matched);
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

  // Draft recovery from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.issueTitle) setIssueTitle(parsed.issueTitle);
        if (parsed.issueDescription) setIssueDescription(parsed.issueDescription);
        if (parsed.customFieldsValues) setCustomFieldsValues(parsed.customFieldsValues);
      }
    } catch {
      // ignore draft parse error
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    try {
      if (issueTitle || issueDescription || Object.keys(customFieldsValues).length > 0) {
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            issueTitle,
            issueDescription,
            customFieldsValues,
            catalogItemId: selectedCatalogItem?.id,
          })
        );
      }
    } catch {
      // ignore
    }
  }, [issueTitle, issueDescription, customFieldsValues, selectedCatalogItem]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    catalogItems.forEach((it) => set.add(it.category));
    return ["All", ...Array.from(set)];
  }, [catalogItems]);

  // Filtered Catalog
  const filteredCatalog = useMemo(() => {
    return catalogItems.filter((it) => {
      const matchCat = selectedCategory === "All" || it.category === selectedCategory;
      const matchSearch =
        !catalogSearch.trim() ||
        it.name_ar.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (it.description_ar && it.description_ar.toLowerCase().includes(catalogSearch.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [catalogItems, selectedCategory, catalogSearch]);

  // Assets filtered by employee
  const relevantAssets = useMemo(() => {
    if (!requesterId) return assets;
    const userAssets = assets.filter((a) => a.assigned_to_id === requesterId);
    return userAssets.length > 0 ? userAssets : assets;
  }, [assets, requesterId]);

  // Handle Catalog Selection
  const handleSelectCatalogItem = (item: CatalogItem) => {
    setSelectedCatalogItem(item);
    setPriority(item.default_priority || "Medium");
    if (!issueTitle) setIssueTitle(item.name_ar);
    // Initialize default values for dynamic fields
    const defaults: Record<string, any> = {};
    item.dynamic_form_schema?.fields?.forEach((f) => {
      if (f.options && f.options.length > 0) {
        defaults[f.name] = f.options[0];
      } else {
        defaults[f.name] = "";
      }
    });
    setCustomFieldsValues(defaults);
    setActiveStep(1); // Advance to context step
  };

  // Validation before advancing
  const canAdvance = useMemo(() => {
    if (activeStep === 0) return !!selectedCatalogItem;
    if (activeStep === 1) return true; // Context optional
    if (activeStep === 2) {
      // Check required dynamic fields
      if (selectedCatalogItem?.dynamic_form_schema?.fields) {
        for (const f of selectedCatalogItem.dynamic_form_schema.fields) {
          if (f.required && !customFieldsValues[f.name]) {
            return false;
          }
        }
      }
      return true;
    }
    if (activeStep === 3) return issueTitle.trim().length > 0;
    return true;
  }, [activeStep, selectedCatalogItem, customFieldsValues, issueTitle]);

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
        category: selectedCatalogItem?.category || "Hardware",
        priority: priority,
        ticket_type: selectedCatalogItem?.requires_approval ? "Service_Request" : "Incident",
        tier: "L1",
        voice_note_url: voiceUrl,
        requester_id: requesterId || null,
        related_asset_id: selectedAssetId || null,
        custom_fields_data: Object.keys(customFieldsValues).length > 0 ? customFieldsValues : null,
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
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-foreground">
                معالج طلبات الخدمة التقنية الذكي
              </h3>
              <p className="text-xs text-muted-foreground">
                نظام إسناد الطلبات المؤتمت وفق إطار عمل ITIL 4
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition"
          >
            إلغاء
          </button>
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
        {/* STEP 1: SERVICE CATALOG */}
        {activeStep === 0 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {cat === "All" ? "الكل" : cat}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="بحث في دليل الخدمات..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-1.5 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            {loadingCatalog ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                جاري تحميل دليل الخدمات التقنية...
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                لم يتم العثور على خدمات مطابقة لبحثك.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
                {filteredCatalog.map((item) => {
                  const isSelected = selectedCatalogItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectCatalogItem(item)}
                      className={`relative p-4 rounded-2xl border transition-all text-right cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20"
                          : "bg-card border-border/70 hover:border-primary/50 hover:shadow-xs"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            {getCategoryIcon(item.category, "w-5 h-5 text-primary")}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {item.requires_approval && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                <Shield className="w-3 h-3" /> يتطلب اعتماد
                              </span>
                            )}
                            <ServicePriorityBadge priority={item.default_priority} />
                          </div>
                        </div>

                        <h4 className="text-sm font-bold text-foreground mb-1">
                          {item.name_ar}
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {item.description_ar || "خدمة تقنية مخصصة."}
                        </p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          مدة الإنجاز التقديرية: {item.estimated_duration_hours || 4} ساعة
                        </span>
                        {isSelected && (
                          <span className="text-primary font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> تم الاختيار
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CONTEXT & IMPACT */}
        {activeStep === 1 && (
          <div className="space-y-4 max-w-xl mx-auto py-2">
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {getCategoryIcon(selectedCatalogItem?.category || "Hardware", "w-4 h-4")}
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-primary">الخدمة المحددة:</span>
                <div className="text-xs font-extrabold text-foreground">{selectedCatalogItem?.name_ar}</div>
              </div>
            </div>

            {/* Requester Select */}
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-primary" /> الموظف صاحب الطلب أو المتأثر
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
              <span className="text-[10px] text-muted-foreground">
                يمكنك التقديم نيابة عن زميل عمل أو لقسمك.
              </span>
            </div>

            {/* Priority / Impact Level */}
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-primary" /> مستوى الأهمية والأثر التشغيلي
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "Critical", label: "حرج (P1)", sub: "تعطل كلي للفرع" },
                  { id: "High", label: "مرتفع (P2)", sub: "عطل يعيق العمل" },
                  { id: "Medium", label: "متوسط (P3)", sub: "تأثير جزئي محدود" },
                  { id: "Low", label: "منخفض (P4)", sub: "استفسار أو ترقية" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id)}
                    className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                      priority === p.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/40 border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className="text-xs font-bold">{p.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        priority === p.id ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {p.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DYNAMIC FIELDS & ASSETS */}
        {activeStep === 2 && (
          <div className="space-y-5 max-w-xl mx-auto py-2">
            {/* Asset Picker */}
            <div className="space-y-1.5 text-right">
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
              <span className="text-[10px] text-muted-foreground">
                ربط الأصل بالتذكرة يتيح للفني الاطلاع الفوري على سجل الصيانة والمواصفات الفنية.
              </span>
            </div>

            {/* Schema-Driven Dynamic Form Fields */}
            {selectedCatalogItem?.dynamic_form_schema?.fields &&
              selectedCatalogItem.dynamic_form_schema.fields.length > 0 && (
                <div className="space-y-4 pt-3 border-t border-border/60">
                  <h4 className="text-xs font-black text-foreground text-right flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> الحقول التفاعلية الخاصة بهذه الخدمة
                  </h4>

                  {selectedCatalogItem.dynamic_form_schema.fields.map((field) => (
                    <div key={field.name} className="space-y-1.5 text-right">
                      <label className="text-xs font-bold text-foreground">
                        {field.label_ar}
                        {field.required && <span className="text-rose-500 mr-1">*</span>}
                      </label>

                      {field.type === "select" && (
                        <select
                          value={customFieldsValues[field.name] || ""}
                          onChange={(e) =>
                            setCustomFieldsValues({
                              ...customFieldsValues,
                              [field.name]: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          <option value="">-- اختر خياراً --</option>
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}

                      {field.type === "radio" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {field.options?.map((opt) => (
                            <label
                              key={opt}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                                customFieldsValues[field.name] === opt
                                  ? "bg-primary/10 border-primary text-primary font-bold"
                                  : "bg-muted/30 border-border text-foreground hover:bg-muted/50"
                              }`}
                            >
                              <input
                                type="radio"
                                name={field.name}
                                value={opt}
                                checked={customFieldsValues[field.name] === opt}
                                onChange={(e) =>
                                  setCustomFieldsValues({
                                    ...customFieldsValues,
                                    [field.name]: e.target.value,
                                  })
                                }
                                className="text-primary focus:ring-primary"
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {field.type === "text" && (
                        <input
                          type="text"
                          placeholder={field.placeholder || ""}
                          value={customFieldsValues[field.name] || ""}
                          onChange={(e) =>
                            setCustomFieldsValues({
                              ...customFieldsValues,
                              [field.name]: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      )}

                      {field.type === "textarea" && (
                        <textarea
                          rows={2}
                          placeholder={field.placeholder || ""}
                          value={customFieldsValues[field.name] || ""}
                          onChange={(e) =>
                            setCustomFieldsValues({
                              ...customFieldsValues,
                              [field.name]: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* STEP 4: MULTIMEDIA & VOICE RECORDER */}
        {activeStep === 3 && (
          <div className="space-y-4 max-w-xl mx-auto py-2 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                عنوان المشكلة أو الطلب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="مثال: الشاشة ترمش وتتحول للون الأسود عند توصيل الشاحن"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                الوصف التفصيلي والأعراض الملاحظة
              </label>
              <textarea
                rows={3}
                placeholder="اشرح بدقة ما حدث، رسائل الخطأ، وما قمت بتجربته..."
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            {/* Voice Task Recorder Integration */}
            <div className="pt-2">
              <label className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5 justify-end">
                <Mic className="w-3.5 h-3.5 text-primary" /> تسجيل ملاحظة صوتية سريعة للفني (اختياري)
              </label>
              <VoiceTaskRecorder onRecordingComplete={(res) => setVoiceResult(res)} />
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW & CONFIRM */}
        {activeStep === 4 && (
          <div className="space-y-4 max-w-xl mx-auto py-2 text-right">
            <div className="bg-muted/40 border border-border/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <span className="text-xs text-muted-foreground">نوع الخدمة:</span>
                <span className="text-xs font-bold text-foreground flex items-center gap-1">
                  {getCategoryIcon(selectedCatalogItem?.category || "Hardware", "w-3.5 h-3.5 text-primary")}
                  {selectedCatalogItem?.name_ar}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <span className="text-xs text-muted-foreground">الأولوية ومستوى الخدمة:</span>
                <ServicePriorityBadge priority={priority} />
              </div>

              {selectedCatalogItem?.requires_approval && (
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <span className="text-xs text-muted-foreground">مسار الاعتماد الإداري:</span>
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                    مطلوب اعتماد ({selectedCatalogItem.approval_type || "المدير المباشر"})
                  </span>
                </div>
              )}

              {selectedAssetId && (
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <span className="text-xs text-muted-foreground">الأصل المرتبط:</span>
                  <span className="text-xs font-bold text-foreground">
                    {assets.find((a) => a.id === selectedAssetId)?.asset_name || "أصل محدد"}
                  </span>
                </div>
              )}

              <div>
                <span className="text-xs text-muted-foreground block mb-1">عنوان الطلب:</span>
                <p className="text-xs font-extrabold text-foreground">{issueTitle}</p>
                {issueDescription && (
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed bg-background/50 p-2 rounded-lg border border-border/40">
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
                سيتم إرسال الطلب آلياً إلى أقرب فني متاح أو رفعه للاعتماد الإداري فور النقر على "إرسال
                الطلب الآن".
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
            className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-muted transition cursor-pointer"
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

        {activeStep < WIZARD_STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setActiveStep((prev) => prev + 1)}
            className={`flex items-center gap-1 px-5 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              canAdvance
                ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
            }`}
          >
            التالي <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-6 py-2 text-xs font-extrabold bg-primary text-primary-foreground hover:opacity-95 rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? "جاري التقديم..." : "إرسال الطلب الآن"}
            <CheckCircle2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
