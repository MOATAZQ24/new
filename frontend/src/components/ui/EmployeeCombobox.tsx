"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import { useEffect, useId, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";

export interface EmployeeOption {
  id: string;
  full_name: string;
  employee_number?: string;
  department_name?: string;
  job_title?: string;
  employment_status?: string;
  account_status?: string;
  assignable?: boolean;
  is_telegram_linked?: boolean;
  telegram_username?: string;
  telegram_notifications_enabled?: boolean;
}

interface Props {
  value: string;
  initialName?: string;
  companyId?: string;
  onChange: (employee: EmployeeOption | null) => void;
  onResolve?: (employee: EmployeeOption | null) => void;
}

export default function EmployeeCombobox({ value, initialName, companyId, onChange, onResolve }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const sequence = useRef(0);
  const [query, setQuery] = useState(initialName || "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [selected, setSelected] = useState<EmployeeOption | null>(null);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!value) return;
    const controller = new AbortController();
    apiRequest<EmployeeOption[]>(`/tasks/assignees?selected_id=${encodeURIComponent(value)}`, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        const employee = response.data[0];
        setSelected(employee || null);
        onResolve?.(employee || null);
        if (employee) setQuery(employee.full_name);
        else setError("الموظف المسند إليه غير متاح في المنشأة الحالية. اختر موظفاً آخر.");
      }).catch(e => { if (!controller.signal.aborted) setError(e.message || "تعذر تحميل الموظف الحالي."); });
    return () => controller.abort();
  }, [value, companyId, onResolve]);

  useEffect(() => {
    if (!open) return;
    const request = ++sequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: query.slice(0,160), limit: "15" });
        const response = await apiRequest<EmployeeOption[]>(`/tasks/assignees?${params}`, { signal: controller.signal });
        if (sequence.current === request) { setOptions(response.data); setActive(-1); }
      } catch (e) {
        if (!controller.signal.aborted && sequence.current === request) setError(e instanceof Error ? e.message : "تعذر البحث عن الموظفين.");
      } finally {
        if (!controller.signal.aborted && sequence.current === request) setLoading(false);
      }
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, open, companyId]);

  useEffect(() => {
    input.current?.setCustomValidity((query && !value) || (value && (!selected || selected.assignable === false))
      ? "اختر موظفاً نشطاً من نتائج البحث أو امسح الحقل." : "");
  }, [query, value, selected]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (employee: EmployeeOption) => {
    if (!employee.assignable) return;
    setSelected(employee); setQuery(employee.full_name); setError("");
    onChange(employee); input.current?.focus(); setOpen(false);
  };
  const show = () => { setOpen(true); setLoading(true); setError(""); };

  return <div dir="rtl" className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700">الموظف / الفني المسند إليه</label>
    <div className="flex rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-[#187A5A]">
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={`${id}-list`} aria-describedby={`${id}-status`}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        autoComplete="off" value={query} maxLength={160} placeholder="ابحث باسم الموظف..."
        className="min-w-0 w-full rounded-lg px-3 py-2 text-sm outline-none"
        onFocus={show} onClick={() => { if (!open) show(); }}
        onChange={event => {
          ++sequence.current; setQuery(event.target.value); setSelected(null); setOptions([]); setActive(-1); show();
          if (value) onChange(null);
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); if (!open) { show(); return; }
            const enabled = options.map((employee, index) => employee.assignable ? index : -1).filter(index => index >= 0);
            if (!enabled.length) return;
            const position = enabled.indexOf(active);
            const next = event.key === "ArrowDown" ? (position + 1) % enabled.length : (position <= 0 ? enabled.length - 1 : position - 1);
            setActive(enabled[next]);
          } else if (event.key === "Enter" && open) {
            event.preventDefault(); if (active >= 0) choose(options[active]);
          }
        }} />
      {(query || value) && <button type="button" aria-label="مسح الموظف المحدد" className="shrink-0 px-3 text-gray-500 hover:text-gray-900"
        onClick={() => { setQuery(""); setSelected(null); onChange(null); setOpen(false); setError(""); }}>×</button>}
    </div>
    {open && <div className="motion-dropdown absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label="الموظفون المتاحون للإسناد" aria-busy={loading} className="max-h-64 overflow-y-auto overscroll-contain">
        {!loading && !error && options.map((employee, index) => <li key={employee.id} id={`${id}-option-${index}`} role="option"
          data-index={index} aria-selected={employee.id === value} aria-disabled={!employee.assignable}
          tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(employee)} onMouseMove={() => setActive(index)}
          className={`motion-dropdown-option cursor-pointer border-b border-gray-100 px-3 py-3 text-sm last:border-0 ${active === index ? "bg-emerald-50" : "hover:bg-gray-50"} ${employee.assignable ? "" : "opacity-50"}`}>
          <span className="block break-words font-semibold text-gray-900">{employee.full_name}</span>
          <span className="block break-words text-xs text-gray-500">{[employee.department_name, employee.job_title].filter(Boolean).join(" · ")}</span>
          <span className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className={employee.assignable ? "text-emerald-700" : "text-gray-500"}>{employee.assignable ? "نشط (Active)" : "غير نشط (Inactive)"}</span>
            <span className={`inline-flex items-center gap-1 ${employee.is_telegram_linked ? "text-emerald-700" : "text-gray-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${employee.is_telegram_linked ? "bg-emerald-500" : "bg-gray-400"}`} />
              <span>{employee.is_telegram_linked ? "Telegram مرتبط" : "Telegram غير مرتبط"}</span>
            </span>
            {employee.employee_number && <span className="text-gray-500">الرقم الوظيفي: <bdi>{employee.employee_number}</bdi></span>}
          </span>
        </li>)}
      </ul>
      <div role="status" className="px-3 py-2 text-xs text-gray-500">
        {loading ? "جارٍ البحث..." : error || (options.length ? "اختر باللمس أو بمفاتيح الأسهم وEnter. اكتب اسماً أدق لمزيد من النتائج." : "لا يوجد موظفون مطابقون متاحون للإسناد.")}
      </div>
    </div>}
    <p id={`${id}-status`} role="status" className="mt-1 text-xs text-gray-500">{error || (selected?.assignable === false ? "الموظف الحالي غير نشط. اختر موظفاً آخر." : "الربط بـ Telegram لا يدل على التواجد أو التوفر.")}</p>
  </div>;
}
