/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Search,
  CheckCircle2,
  ThumbsUp,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  symptom: string;
  diagnostic_steps?: string;
  resolution: string;
  is_published: boolean;
  author_name?: string;
  created_at: string;
}

interface KnowledgeBaseSearchProps {
  onOpenTicketWizard?: () => void;
}

export default function KnowledgeBaseSearch({ onOpenTicketWizard }: KnowledgeBaseSearchProps) {
  const { currentCompany } = useAuth();
  const toast = useToast();

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [helpfulFeedback, setHelpfulFeedback] = useState<Record<string, boolean>>({});

  const loadArticles = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (category !== "All") params.category = category;

      const res = await api.get<KnowledgeArticle[]>("/tickets/knowledge/list", { params });
      setArticles(res.data || []);
    } catch (err) {
      console.error("Failed to load knowledge articles", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      loadArticles();
    }, 200);
    return () => clearTimeout(t);
  }, [search, category, currentCompany]);

  const handleToggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleHelpful = (id: string) => {
    setHelpfulFeedback((prev) => ({ ...prev, [id]: true }));
    toast.success("شكراً لتقييمك! ساعدنا هذا التقييم في تحسين مقالات الدعم الذاتي.");
  };

  return (
    <div className="space-y-4 text-right">
      {/* Search Header Banner */}
      <div className="bg-gradient-to-l from-primary/15 via-primary/5 to-transparent border border-primary/20 rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="max-w-xl mx-auto text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mx-auto shadow-md">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-foreground">
            قاعدة المعرفة والحلول الذاتية المعتمدة
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            ابحث عن الحلول الفورية للأعطال الشائعة وخطوات استكشاف الأخطاء المعتمدة من فريق IT
          </p>

          {/* Search Bar */}
          <div className="relative pt-2">
            <Search className="w-5 h-5 absolute right-4 top-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="اكتب العطل أو رسالة الخطأ (مثال: طابعة، كلمة المرور، بطء الشبكة)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-12 pl-4 py-3 text-sm rounded-2xl bg-card border border-border shadow-xs focus:ring-2 focus:ring-primary/20 outline-none text-right font-medium"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
          {["All", "Hardware", "Network", "Software", "Access", "General"].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                category === cat
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat === "All" ? "كافة التصنيفات" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Articles List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            جاري البحث في قاعدة المعرفة...
          </div>
        ) : articles.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground bg-card border border-border/70 rounded-2xl p-6 space-y-3">
            <HelpCircle className="w-8 h-8 text-muted-foreground/60 mx-auto" />
            <p className="font-bold text-foreground">لم نعثر على مقال يطابق بحثك حالياً.</p>
            {onOpenTicketWizard && (
              <button
                type="button"
                onClick={onOpenTicketWizard}
                className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-xs"
              >
                افتح تذكرة دعم فني جديدة
              </button>
            )}
          </div>
        ) : (
          articles.map((art) => {
            const isExpanded = expandedId === art.id;
            const isVoted = helpfulFeedback[art.id];

            return (
              <div
                key={art.id}
                className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-2xs transition-all"
              >
                <div
                  onClick={() => handleToggle(art.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-bold">
                      {art.category}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-foreground">{art.title}</h3>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4 pt-1 border-t border-border/60 bg-muted/10 space-y-3 text-right">
                    <div>
                      <span className="text-xs font-bold text-primary block mb-1">
                        الأعراض والمشكلة:
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {art.symptom}
                      </p>
                    </div>

                    {art.diagnostic_steps && (
                      <div className="bg-card p-3 rounded-xl border border-border/60">
                        <span className="text-xs font-bold text-foreground block mb-1">
                          خطوات الفحص الأولي:
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {art.diagnostic_steps}
                        </p>
                      </div>
                    )}

                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl">
                      <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 block mb-1">
                        طريقة الحل المعتمدة:
                      </span>
                      <p className="text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed whitespace-pre-wrap font-medium">
                        {art.resolution}
                      </p>
                    </div>

                    {/* Feedback Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                      <div className="flex items-center gap-2">
                        {isVoted ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> شكراً لتقييمك!
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleHelpful(art.id)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-bold px-2 py-1 rounded-lg border border-border hover:bg-muted transition"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" /> هل كان هذا الحل مفيداً؟
                          </button>
                        )}
                      </div>

                      <span className="text-[10px] text-muted-foreground">
                        حرر بواسطة: {art.author_name || "فريق IT"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Persistent Help Desk CTA */}
      <div className="bg-card border border-border/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
        <div>
          <h4 className="text-xs font-black text-foreground">
            لم تجد حلاً للمشكلة الفنية التي تواجهها؟
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            فريق الدعم الفني جاهز لخدمتك فورياً عبر معالج التذاكر التفاعلي
          </p>
        </div>
        {onOpenTicketWizard && (
          <button
            type="button"
            onClick={onOpenTicketWizard}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-primary text-primary-foreground hover:opacity-95 shadow-xs transition cursor-pointer"
          >
            <span>طلب مساعدة فنية الآن</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
