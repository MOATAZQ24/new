"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Modal } from "@/components/ui/Modal";
import { Icons } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function InfrastructurePage() {
  const { activeCompanyId } = useAuth();
  const toast = useToast();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // New Device Form
  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("Server");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [hostname, setHostname] = useState("");
  const [managementIp, setManagementIp] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [vlan, setVlan] = useState("");
  const [location, setLocation] = useState("");
  const [credentialRef, setCredentialRef] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [statusVal, setStatusVal] = useState("Active");
  const [notes, setNotes] = useState("");

  const fetchDevices = async () => {
    setLoading(true);
    try {
      let url = `/infrastructure?search=${encodeURIComponent(debouncedSearch)}`;
      if (typeFilter) url += `&device_type=${typeFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await api.get(url);
      setDevices(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل أجهزة البنية التحتية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [typeFilter, statusFilter, activeCompanyId, debouncedSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/infrastructure", {
        company_id: activeCompanyId,
        device_name: deviceName,
        device_type: deviceType,
        manufacturer,
        model,
        serial_number: serialNumber,
        hostname,
        management_ip: managementIp,
        network_name: networkName,
        vlan,
        location,
        credential_reference: credentialRef,
        firmware_version: firmwareVersion,
        status: statusVal,
        notes,
      });
      setShowAddModal(false);
      setDeviceName("");
      setManufacturer("");
      setModel("");
      setHostname("");
      setManagementIp("");
      setCredentialRef("");
      setNotes("");
      fetchDevices();
    } catch (err: any) {
      toast.error(err?.message || "فشل إضافة جهاز البنية التحتية");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <PageHeader
        title="سجل البنية التحتية والشبكات (IT Infrastructure)"
        description="إدارة الخوادم، أجهزة التوجيه، جدران الحماية، محولات الشبكة، ونقاط الوصول"
        icon={<Icons.Infrastructure size={20} />}
        actions={
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="motion-control flex items-center gap-1.5 px-3.5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Icons.Plus size={16} />
            <span>إضافة جهاز بنية تحتية</span>
          </button>
        }
      />

      {/* Filter Bar */}
      <DataToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="بحث باسم الجهاز، IP، الهوست..."
        searchLabel="بحث في البنية التحتية"
        activeFilterCount={[search.trim(), typeFilter, statusFilter].filter(Boolean).length}
        onResetFilters={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }}
        onRefresh={() => void fetchDevices()}
        refreshing={loading}
        filters={
          <>
            <select
              aria-label="تصفية حسب نوع الجهاز"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              <option value="">جميع أنواع الأجهزة</option>
              <option value="Server">خادم (Server)</option>
              <option value="Firewall">جدار حماية (Firewall)</option>
              <option value="Router">راوتر (Router)</option>
              <option value="Switch">سويتش (Switch)</option>
              <option value="Access Point">نقطة وصول (Access Point)</option>
              <option value="NAS">وحدة تخزين شبكي (NAS)</option>
              <option value="Other">أخرى (Other)</option>
            </select>

            <select
              aria-label="تصفية حسب حالة الجهاز"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs py-2 px-3 rounded-xl outline-none focus:border-[#187A5A] text-slate-800"
            >
              <option value="">جميع الحالات</option>
              <option value="Active">نشط (Active)</option>
              <option value="Offline">غير متصل (Offline)</option>
              <option value="Maintenance">تحت الصيانة (Maintenance)</option>
              <option value="Decommissioned">خارج الخدمة (Decommissioned)</option>
            </select>
          </>
        }
      />

      {/* Devices Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton variant="table" rows={5} cols={7} />
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Icons.Infrastructure size={26} />}
            title="لا توجد أجهزة بنية تحتية مطابقة"
            description="يمكنك تعديل الفلاتر أو إضافة خادم أو جهاز شبكة جديد"
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <tr>
                <th className="p-3.5">اسم الجهاز</th>
                <th className="p-3.5">النوع</th>
                <th className="p-3.5">عنوان IP للإدارة</th>
                <th className="p-3.5">الشركة والموديل</th>
                <th className="p-3.5">اسم المضيف (Hostname)</th>
                <th className="p-3.5">الموقع</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">
                    <div>{d.device_name}</div>
                    <div className="text-[11px] text-slate-600 font-normal">
                      {d.network_name || "-"}
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-700 font-semibold">{d.device_type}</td>
                  <td className="p-3.5 font-mono font-bold text-[#187A5A]">
                    <bdi dir="ltr">{d.management_ip || "-"}</bdi>
                  </td>
                  <td className="p-3.5 text-slate-700">
                    {d.manufacturer} {d.model}
                  </td>
                  <td className="p-3.5 font-mono text-slate-600"><bdi dir="ltr">{d.hostname || "-"}</bdi></td>
                  <td className="p-3.5 text-slate-700">{d.location || "-"}</td>
                  <td className="p-3.5">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDevice(d);
                        setShowDetailsModal(true);
                      }}
                      className="motion-control px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#187A5A] text-slate-700 hover:text-[#187A5A] font-semibold text-[11px] cursor-pointer"
                    >
                      التفاصيل والربط
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Add Device Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة جهاز بنية تحتية جديد"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم الجهاز (Device Name) *
              </label>
              <input
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="SW-CORE-01"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الجهاز *
              </label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              >
                <option value="Server">خادم (Server)</option>
                <option value="Firewall">جدار حماية (Firewall)</option>
                <option value="Router">راوتر (Router)</option>
                <option value="Switch">سويتش (Switch)</option>
                <option value="Access Point">نقطة وصول (Access Point)</option>
                <option value="NAS">وحدة تخزين شبكي (NAS)</option>
                <option value="Other">أخرى (Other)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عنوان IP للإدارة (Management IP)
              </label>
              <input
                type="text"
                value={managementIp}
                onChange={(e) => setManagementIp(e.target.value)}
                placeholder="10.0.1.1"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم المضيف (Hostname)
              </label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="core-sw.corp.local"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشركة المصنعة والموديل
              </label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Cisco Catalyst 9300"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الموقع الفيزيائي
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="غرفة الخوادم - الراك A2"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              مرجع الخزنة السرية للمصادقة (Credential Reference - Vault)
            </label>
            <input
              type="text"
              value={credentialRef}
              onChange={(e) => setCredentialRef(e.target.value)}
              placeholder="vault://infra/core-switch/root"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#187A5A] font-mono bg-slate-50"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              * متطلب أمان: لا يتم تخزين كلمات المرور كنصوص واضحة مطلقاً، بل مرجع في خزنة الأسرار.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#123D32] hover:bg-[#187A5A] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              حفظ الجهاز
            </button>
          </div>
        </form>
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`مواصفات الجهاز: ${selectedDevice?.device_name || ""}`}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-3">
            <div>
              <span className="text-slate-400">اسم الجهاز:</span>{" "}
              <span className="font-bold">{selectedDevice?.device_name}</span>
            </div>
            <div>
              <span className="text-slate-400">النوع:</span>{" "}
              <span className="font-semibold">{selectedDevice?.device_type}</span>
            </div>
            <div>
              <span className="text-slate-400">IP الإدارة:</span>{" "}
              <span className="font-mono font-bold text-[#187A5A]">
                {selectedDevice?.management_ip || "-"}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Hostname:</span>{" "}
              <span className="font-mono">{selectedDevice?.hostname || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الشبكة / VLAN:</span>{" "}
              <span>{selectedDevice?.network_name} • {selectedDevice?.vlan || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الموقع:</span>{" "}
              <span>{selectedDevice?.location || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الفيرموير:</span>{" "}
              <span className="font-mono">{selectedDevice?.firmware_version || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">الحالة التشغيلية:</span>{" "}
              <StatusBadge status={selectedDevice?.status || "Active"} />
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="font-bold text-amber-900 block mb-0.5">مرجع بيانات الاعتماد (Vault Reference):</span>
            <span className="font-mono text-amber-800 text-[11px] break-all">
              {selectedDevice?.credential_reference || "غير محدد"}
            </span>
          </div>

          {selectedDevice?.notes && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl">
              <span className="font-bold text-slate-800 block mb-0.5">ملاحظات فنية:</span>
              <p className="text-slate-600">{selectedDevice.notes}</p>
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
}
