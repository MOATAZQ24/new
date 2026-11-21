"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useState } from "react";
import { TablePreference, useWorkspace } from "@/context/WorkspaceContext";
import { ReorderList } from "@/components/ui/ReorderList";

export interface TableColumn { id: string; label: string }
export const defaultTablePreference: TablePreference = { columns: [], hidden: [], per_page: 20, density: "comfortable", filters: {}, sort: "", view: "" };
export function useTablePreference(tableId: string) {
  const { draft } = useWorkspace();
  return draft.tables[tableId] || defaultTablePreference;
}
export function TablePreferences({ tableId, columns, filters = {}, onApplyFilters }: {
  tableId: string; columns: TableColumn[]; filters?: Record<string, string>; onApplyFilters?: (filters: Record<string, string>) => void;
}) {
  const { draft, setDraft, save } = useWorkspace();
  const pref = useTablePreference(tableId);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<TablePreference>) => setDraft(d => ({ ...d, tables: { ...d.tables, [tableId]: { ...pref, ...patch } } }));
  const order = [...pref.columns.filter(id => columns.some(c => c.id === id)), ...columns.map(c => c.id).filter(id => !pref.columns.includes(id))];
  const persist = async (reset = false) => {
    setBusy(true); setStatus("");
    const tables = { ...draft.tables };
    if (reset) delete tables[tableId];
    else tables[tableId] = { ...pref, columns: order, filters };
    try { await save({ ...draft, tables }); if (reset) onApplyFilters?.({}); setStatus("تم الحفظ / Saved"); }
    catch (e) { setStatus(e instanceof Error ? e.message : "تعذر الحفظ"); }
    finally { setBusy(false); }
  };
  return <details className="workspace-settings bg-white border rounded-xl p-4">
    <summary className="cursor-pointer font-bold">تفضيلات الجدول / Table preferences</summary>
    <div className="grid sm:grid-cols-3 gap-4 my-4">
      <label>اسم العرض / View name<input maxLength={80} value={pref.view} onChange={e => update({ view: e.target.value })} /></label>
      <label>صفوف الصفحة / Rows per page<select value={pref.per_page} onChange={e => update({ per_page: Number(e.target.value) })}>{[10, 20, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>الكثافة / Table density<select value={pref.density} onChange={e => update({ density: e.target.value })}><option value="compact">مضغوط / Compact</option><option value="comfortable">مريح / Comfortable</option><option value="spacious">واسع / Spacious</option></select></label>
      <label>الترتيب / Sorting<select value={pref.sort} onChange={e => update({ sort: e.target.value })}><option value="">الأحدث / Newest</option>{columns.filter(c => !["qr", "custody", "actions"].includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    </div>
    <ReorderList items={order} itemKey={id => id} onChange={columns => update({ columns })} render={id => <label className="flex gap-2"><input type="checkbox" checked={!pref.hidden.includes(id)} disabled={!pref.hidden.includes(id) && order.length - pref.hidden.length === 1} onChange={e => update({ hidden: e.target.checked ? pref.hidden.filter(c => c !== id) : [...pref.hidden, id] })} />{columns.find(c => c.id === id)?.label}</label>} />
    <div className="flex flex-wrap gap-3 mt-4"><button disabled={busy} onClick={() => void persist()}>حفظ العرض والفلاتر / Save view & filters</button><button disabled={busy} onClick={() => onApplyFilters?.(pref.filters)}>تطبيق الفلاتر المحفوظة / Apply saved filters</button><button disabled={busy} onClick={() => void persist(true)}>إعادة ضبط الجدول / Reset table</button></div>
    <p role="status">{status}</p>
  </details>;
}

/** Keep existing cell contents and action handlers while changing presentation only. */
export function PreferenceRow({ tableId, columns, children, ...props }: { tableId: string; columns: TableColumn[]; children: React.ReactNode } & React.HTMLAttributes<HTMLTableRowElement>) {
  const pref = useTablePreference(tableId);
  const cells = React.Children.toArray(children);
  const order = [...pref.columns.filter(id => columns.some(c => c.id === id)), ...columns.map(c => c.id).filter(id => !pref.columns.includes(id))].filter(id => !pref.hidden.includes(id));
  return <tr {...props} data-table-density={pref.density}>{order.map(id => <React.Fragment key={id}>{cells[columns.findIndex(c => c.id === id)]}</React.Fragment>)}</tr>;
}
