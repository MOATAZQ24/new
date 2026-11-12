"use client";

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات النظام والحساب</h1>
          <p className="text-sm text-gray-500 mt-1">
            إدارة بيانات الحساب الشخصي، الأمان، ومعلومات بيئة التشغيل
          </p>
        </div>

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
