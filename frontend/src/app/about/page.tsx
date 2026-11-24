"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import React, { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import { BrandMark } from "@/components/ui/BrandMark";
import { ShieldCheck, Code2, Scale, FileText, Mail, Globe, BookOpen } from "lucide-react";

interface ReleaseMetadata {
  product: string;
  version: string;
  copyright_year: number;
  developer: {
    name_en: string;
    name_ar: string;
    role: string;
    linkedin_url?: string;
    email?: string;
  };
  legal?: {
    publisher_status?: string;
    exclusive_ownership_claimed?: boolean;
    license_notice?: string;
  };
}

const THIRD_PARTY_COMPONENTS = [
  { name: "Next.js", category: "Frontend Framework", license: "MIT License" },
  { name: "React & React DOM", category: "UI Runtime", license: "MIT License" },
  { name: "Tailwind CSS", category: "Styling Engine", license: "MIT License" },
  { name: "Radix UI (@radix-ui/react-switch)", category: "Accessible Primitives", license: "MIT License" },
  { name: "Lucide React", category: "SVG Iconography", license: "ISC License" },
  { name: "clsx & tailwind-merge", category: "Class Utilities", license: "MIT License" },
  { name: "FastAPI & Starlette", category: "Backend API Framework", license: "MIT / BSD-3-Clause" },
  { name: "SQLAlchemy & Alembic", category: "ORM & Migrations", license: "MIT License" },
  { name: "Pydantic", category: "Schema Validation", license: "MIT License" },
  { name: "Argon2-cffi", category: "Password Hashing", license: "MIT License" },
  { name: "PostgreSQL", category: "Relational Database", license: "PostgreSQL License" },
];

export default function AboutPage() {
  const [meta, setMeta] = useState<ReleaseMetadata>({
    product: "Investor Gate OS",
    version: "3.0.0",
    copyright_year: 2026,
    developer: {
      name_en: "Moataz Qasem",
      name_ar: "معتز قاسم",
      role: "Cybersecurity & Networks Specialist",
      linkedin_url: "",
      email: "",
    },
    legal: {
      publisher_status: "PENDING_LEGAL_CONFIRMATION",
      exclusive_ownership_claimed: false,
      license_notice: "Distributed under the license accepted during installation.",
    },
  });

  useEffect(() => {
    let active = true;
    void api
      .get<ReleaseMetadata>("/system/release-info")
      .then((res) => {
        if (active && res.data) setMeta(res.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl shadow-sm overflow-hidden shrink-0">
              <BrandMark size={48} variant="gold-badge" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {meta.product} — حول النظام والهوية البرمجية
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                معلومات الإصدار، هوية المطوّر، إشعارات الحقوق، وتراخيص الطرف الثالث
              </p>
            </div>
          </div>

          <Link
            href="/help"
            className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 inline-flex items-center gap-2 hover:border-[#2563EB] self-start sm:self-center"
          >
            <BookOpen className="w-4 h-4 text-[#2563EB]" />
            <span>مركز المساعدة والتعلّم</span>
          </Link>
        </div>

        {/* Product & Developer Identity Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-900">معلومات المنتج والإصدار</h2>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">المنتج (Product)</span>
                <strong className="text-slate-900 font-mono" dir="ltr">{meta.product}</strong>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">الإصدار (Version)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#1D4ED8] font-mono font-bold">
                  v{meta.version}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">سنة حقوق النشر (Copyright Year)</span>
                <strong className="font-mono text-slate-900">© {meta.copyright_year}</strong>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">نموذج الاستضافة</span>
                <span className="font-semibold text-slate-800">Self-Hosted Enterprise (RTL/LTR)</span>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Code2 className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-900">هوية المطوّر والهندسة الأمنية</h2>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between gap-2">
                <span className="text-slate-500">المطوّر (Developer)</span>
                <strong className="text-slate-900">
                  {meta.developer.name_ar} / <span dir="ltr" className="font-mono">{meta.developer.name_en}</span>
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between gap-2">
                <span className="text-slate-500">الدور التخصصي (Role)</span>
                <strong className="text-slate-800 font-mono" dir="ltr">{meta.developer.role}</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>LinkedIn</span>
                </span>
                {meta.developer.linkedin_url ? (
                  <a
                    href={meta.developer.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                    className="font-mono font-bold text-[#2563EB] hover:underline truncate max-w-[240px]"
                  >
                    {meta.developer.linkedin_url}
                  </a>
                ) : (
                  <span className="text-slate-500">غير مهيأ في release_metadata.json</span>
                )}
              </div>
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between gap-2">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span>البريد المعتمد</span>
                </span>
                {meta.developer.email ? (
                  <a
                    href={`mailto:${meta.developer.email}`}
                    dir="ltr"
                    className="font-mono font-bold text-[#2563EB] hover:underline truncate max-w-[240px]"
                  >
                    {meta.developer.email}
                  </a>
                ) : (
                  <span className="text-slate-500">غير مهيأ في release_metadata.json</span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Copyright & Legal Notice */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
            <Scale className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-sm font-bold text-slate-900">إشعار حقوق النشر والترخيص (Copyright &amp; Legal Notice)</h2>
          </div>
          <div className="text-xs text-slate-700 leading-relaxed space-y-2">
            <p>
              <strong>© {meta.copyright_year} {meta.product}.</strong> تم تطوير وهندسة النظام بواسطة{" "}
              <strong>{meta.developer.name_ar} ({meta.developer.name_en})</strong> — {meta.developer.role}.
            </p>
            <p className="text-slate-600">
              يُفصل هذا الإسناد التقني عن الملكية القانونية للناشر النهائي؛ حيث يظل اعتماد الاسم القانوني للناشر (Publisher Identity) واتفاقية الترخيص التجاري النهائية رهن الاعتماد القانوني الرسمي للمنشأة المالكة.
            </p>
          </div>
        </section>

        {/* Third-Party Notices */}
        <section id="notices" className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2563EB]" />
              <span>إشعارات وتراخيص الطرف الثالث (Third-Party Notices)</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              {THIRD_PARTY_COMPONENTS.length} Core Libraries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5">المكوّن (Package)</th>
                  <th className="p-2.5">الدور</th>
                  <th className="p-2.5">الترخيص (License)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {THIRD_PARTY_COMPONENTS.map((pkg) => (
                  <tr key={pkg.name}>
                    <td className="p-2.5 font-mono font-bold text-slate-900" dir="ltr">{pkg.name}</td>
                    <td className="p-2.5 text-slate-600">{pkg.category}</td>
                    <td className="p-2.5 font-mono text-[#2563EB] font-semibold" dir="ltr">{pkg.license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
