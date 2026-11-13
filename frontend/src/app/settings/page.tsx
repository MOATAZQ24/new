"use client";

import WorkspaceSettings from "@/components/workspace/WorkspaceSettings";
import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { 
  SettingsIcon, LockIcon, UserIcon, BuildingIcon, 
  ShieldCheckIcon, ServerIcon, CheckCircleIcon, AlertCircleIcon 
} from "@/components/ui/Icons";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function SettingsPage() {
  const { user, currentCompany } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassSuccess(null);
    setPassError(null);

    if (newPassword !== confirmPassword) {
      setPassError("كلمتا المرور الجديدتان غير متطابقتين");
      return;
    }

    if (newPassword.length < 8) {
      setPassError("يجب أن تكون كلمة المرور 8 خانات على الأقل");
      return;
    }

    try {
      setPassLoading(true);
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPassSuccess("تم تغيير كلمة المرور بنجاح!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "حدث خطأ أثناء تغيير كلمة المرور";
      setPassError(errorMsg);
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إعدادات النظام والحساب</h1>
            <p className="text-sm text-gray-500 mt-1">
              إدارة بيانات الحساب الشخصي، الأمان، ومعلومات بيئة التشغيل
            </p>
          </div>

          <a
            href="/settings/integrations"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <SettingsIcon className="w-4 h-4 text-[#C5A46D]" />
            <span>مركز التكامل والأتمتة (n8n / Telegram / Gemini)</span>
          </a>
        </div>

        {/* Quick Links to Settings Sections */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a
            href="/settings/appearance"
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200/80 shadow-sm hover:border-[#187A5A] hover:shadow-md transition group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#187A5A]/10 text-[#187A5A] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#187A5A] transition">المظهر والواجهة</div>
              <div className="text-xs text-gray-400">السمة، الألوان، الخطوط، الكثافة</div>
            </div>
          </a>
          <a
            href="/settings/branding"
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200/80 shadow-sm hover:border-[#187A5A] hover:shadow-md transition group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#C5A46D]/10 text-[#C5A46D] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#C5A46D] transition">علامة الشركة التجارية</div>
              <div className="text-xs text-gray-400">الشعار، الهوية البصرية، Favicon</div>
            </div>
          </a>
          <a
            href="/settings/integrations"
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200/80 shadow-sm hover:border-[#187A5A] hover:shadow-md transition group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition">التكاملات والأتمتة</div>
              <div className="text-xs text-gray-400">n8n، Telegram، Google Gemini</div>
            </div>
          </a>
          {user?.is_superadmin && (
            <a
              href="/settings/system"
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200/80 shadow-sm hover:border-[#123D32] hover:shadow-md transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-lg">
                🛡️
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 group-hover:text-[#123D32] transition">صيانة النظام والتعافي (DR)</div>
                <div className="text-xs text-gray-400">النسخ الاحتياطي، صحة السيرفر، السجلات</div>
              </div>
            </a>
          )}
        </div>

        <WorkspaceSettings />

        {/* User Profile Card */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="p-3 rounded-full bg-[#187A5A]/10 text-[#187A5A]">
              <UserIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{user?.username || "المستخدم"}</h2>
              <p className="text-xs text-gray-500">{user?.email || "لا يوجد بريد مسجل"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">اسم الموظف:</span>
              <strong className="text-gray-800 text-sm">{user?.employee?.full_name || "-"}</strong>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">المسمى الوظيفي:</span>
              <span className="text-gray-800 text-sm">{user?.employee?.job_title || "-"}</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">الأدوار والصلاحيات (RBAC):</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {user?.roles?.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#187A5A] text-white">
                    {r}
                  </span>
                )) || <span className="text-gray-500">مستخدم عادي</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Active Company Card */}
        {currentCompany && (
          <div className="bg-white rounded-xl border border-gray-200/80 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="p-3 rounded-full bg-blue-50 text-blue-700">
                <BuildingIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{currentCompany.name_ar}</h2>
                <p className="text-xs text-gray-500">{currentCompany.name_en} ({currentCompany.code})</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-600">
              <div>
                <span className="text-gray-400 block">البريد الإلكتروني للشركة:</span>
                <span className="font-medium text-gray-800">{currentCompany.contact_email || "-"}</span>
              </div>
              <div>
                <span className="text-gray-400 block">رقم الهاتف:</span>
                <span className="font-medium text-gray-800" dir="ltr">{currentCompany.contact_phone || "-"}</span>
              </div>
              <div>
                <span className="text-gray-400 block">حالة العزل السحابي:</span>
                <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                  <ShieldCheckIcon className="w-4 h-4" />
                  عزل كامل للبيانات (Multi-Tenant)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Change Password Card */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="p-3 rounded-full bg-amber-50 text-amber-700">
              <LockIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">تغيير كلمة المرور</h2>
              <p className="text-xs text-gray-500">تحديث كلمة المرور المشفرة بتقنية Argon2id</p>
            </div>
          </div>

          {passSuccess && (
            <div className="p-3 mb-4 text-xs font-semibold text-green-800 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              {passSuccess}
            </div>
          )}

          {passError && (
            <div className="p-3 mb-4 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4" />
              {passError}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                كلمة المرور الحالية <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                كلمة المرور الجديدة <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                تأكيد كلمة المرور الجديدة <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#187A5A]"
              />
            </div>

            <button
              type="submit"
              disabled={passLoading}
              className="px-5 py-2 text-sm font-medium text-white bg-[#187A5A] hover:bg-[#123D32] disabled:opacity-50 rounded-lg shadow-sm transition-colors"
            >
              {passLoading ? "جاري الحفظ..." : "تحديث كلمة المرور"}
            </button>
          </form>
        </div>

        {/* System & Architecture Info */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="p-3 rounded-full bg-purple-50 text-purple-700">
              <ServerIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">معلومات بيئة التشغيل والاستضافة (Self-Hosted)</h2>
              <p className="text-xs text-gray-500">نظام محلي متكامل بدون اشتراكات أو رسوم سحابية دورية</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">نظام التشغيل:</span>
              <span className="font-bold text-gray-800">Ubuntu Server 24.04 LTS</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">محرك الحاويات:</span>
              <span className="font-bold text-gray-800">Docker Engine + Compose</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">قاعدة البيانات:</span>
              <span className="font-bold text-gray-800">PostgreSQL 16.2 Relational</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">الواجهة الأمامية:</span>
              <span className="font-bold text-gray-800">Next.js 16 + Tailwind CSS v4</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">الواجهة الخلفية:</span>
              <span className="font-bold text-gray-800">Python FastAPI + SQLAlchemy 2</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">خوارزمية التشفير:</span>
              <span className="font-bold text-gray-800">Argon2id (OWASP Standard)</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">الوصول الآمن:</span>
              <span className="font-bold text-gray-800">WireGuard VPN / Nginx TLS</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-1">تكاليف التراخيص:</span>
              <span className="font-bold text-green-700">0$ (مجاني ومفتوح المصدر)</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
