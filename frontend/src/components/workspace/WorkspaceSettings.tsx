"use client";
import { useEffect, useRef, useState } from "react";
import { api, apiRequest } from "@/lib/api";
import { Appearance, defaultAppearance, defaultWorkspace, mediaUrl, useWorkspace, widgetLabels } from "@/context/WorkspaceContext";
import { ReorderList } from "@/components/ui/ReorderList";
import { useAuth } from "@/context/AuthContext";

const colorLabels = { primary: "أساسي / Primary", secondary: "ثانوي / Secondary", background: "خلفية / Background", accent: "تمييز / Accent", surface: "سطح / Surface" };
export default function WorkspaceSettings() {
  const { draft, setDraft, saved, save, cancel, info, loading, error, reload } = useWorkspace();
  const { refreshUser, activeCompanyId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [enforced, setEnforced] = useState(info?.enforced || []);
  const savedRef = useRef(saved);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  // Leaving the editor discards unsaved preview changes.
  useEffect(() => () => setDraft(savedRef.current), [setDraft]);
  useEffect(() => { const timer = setTimeout(() => setEnforced(info?.enforced || []), 0); return () => clearTimeout(timer); }, [info]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(""); setFailure("");
    try { await action(); setMessage("تم الحفظ بنجاح / Saved successfully"); }
    catch (e) { setFailure(e instanceof Error ? e.message : "تعذر الحفظ / Save failed"); }
    finally { setBusy(false); }
  };
  const change = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setDraft(d => ({ ...d, appearance: { ...d.appearance, [key]: value } }));
  const upload = async (kind: string, file?: File) => {
    if (!file) return;
    await run(async () => {
      const body = new FormData(); body.append("file", file);
      await apiRequest(`/workspace/branding/${kind}`, { method: "PUT", body });
      await reload(); await refreshUser();
    });
  };
  if (loading) return <p role="status">تحميل إعدادات مساحة العمل… / Loading workspace…</p>;
  if (error) return <div role="alert">{error} <button onClick={() => void reload()}>إعادة المحاولة / Retry</button></div>;
  if (!info) return null;
  return <section className="workspace-settings space-y-6" aria-label="المظهر ومساحة العمل / Appearance and workspace">
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div><h2 className="text-xl font-bold">المظهر ومساحة العمل / Appearance & Workspace</h2><p className="text-sm text-slate-500">معاينة فورية؛ احفظ لتطبيق التفضيلات عند تسجيل الدخول. / Live preview; save to persist.</p></div>
      <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label>السمة / Theme<select disabled={info.enforced.includes("theme")} value={draft.appearance.theme} onChange={e => change("theme", e.target.value)}><option value="light">فاتح / Light</option><option value="dark">داكن / Dark</option><option value="system">النظام / System</option></select></label>
        <label>الكثافة / Density<select disabled={info.enforced.includes("density")} value={draft.appearance.density} onChange={e => change("density", e.target.value)}><option value="compact">مضغوط / Compact</option><option value="comfortable">مريح / Comfortable</option><option value="spacious">واسع / Spacious</option></select></label>
        {Object.entries(colorLabels).map(([key, label]) => <label key={key}>{label}<input type="color" disabled={info.enforced.includes(key)} value={draft.appearance[key as keyof Appearance] as string} onChange={e => change(key as keyof Appearance, e.target.value)} /><bdi>{draft.appearance[key as keyof Appearance]}</bdi></label>)}
        <label>الخط العربي / Arabic font<select disabled={info.enforced.includes("arabic_font")} value={draft.appearance.arabic_font} onChange={e => change("arabic_font", e.target.value)}>{["IBM Plex Sans Arabic", "Tahoma", "Arial"].map(f => <option key={f}>{f}</option>)}</select></label>
        <label>الخط الإنجليزي / English font<select disabled={info.enforced.includes("english_font")} value={draft.appearance.english_font} onChange={e => change("english_font", e.target.value)}>{["Inter", "Arial", "Segoe UI"].map(f => <option key={f}>{f}</option>)}</select></label>
        <label>وزن الخط / Weight<select disabled={info.enforced.includes("font_weight")} value={draft.appearance.font_weight} onChange={e => change("font_weight", Number(e.target.value))}>{[400, 500, 600, 700].map(w => <option key={w}>{w}</option>)}</select></label>
        {([{ key: "font_size", label: "حجم الخط / Font size", min: 14, max: 20 }, { key: "radius", label: "الزوايا / Radius", min: 0, max: 24 }, { key: "sidebar_width", label: "عرض القائمة / Sidebar width", min: 200, max: 340 }] as const).map(({ key, label, min, max }) => <label key={key}>{label} ({draft.appearance[key]}px)<input type="range" min={min} max={max} disabled={info.enforced.includes(key)} value={draft.appearance[key]} onChange={e => change(key, Number(e.target.value))} /></label>)}
      </fieldset>
      {info.enforced.length > 0 && <p className="text-sm">🔒 بعض الخيارات مفروضة من مسؤول الشركة / Some settings are enforced by your administrator.</p>}
      <div className="rounded-xl border p-4 space-y-3" aria-label="معاينة / Preview"><h3 className="font-bold">معاينة / Preview</h3><p>بوابة المستثمر — <bdi>Investor Gate IT Operations</bdi></p><button className="workspace-primary" type="button">إجراء رئيسي / Primary action</button></div>
    </div>
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <h2 className="font-bold">عناصر لوحة المعلومات / Dashboard widgets</h2><p className="text-sm">اسحب المقبض أو استخدم الأسهم لإعادة الترتيب. / Drag the handle or use the arrow buttons.</p>
      <ReorderList items={draft.widgets.filter(w => info.available_widgets.includes(w.id))} itemKey={w => w.id} onChange={widgets => setDraft(d => ({ ...d, widgets }))} render={(w) => <label className="flex gap-2 items-center"><input type="checkbox" checked={w.enabled} onChange={e => setDraft(d => ({ ...d, widgets: d.widgets.map(x => x.id === w.id ? { ...x, enabled: e.target.checked } : x) }))} />{widgetLabels[w.id]}</label>} />
      <button type="button" onClick={() => setDraft(d => ({ ...d, widgets: defaultWorkspace.widgets }))}>استعادة ترتيب اللوحة / Restore dashboard</button>
    </div>
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <h2 className="font-bold">القائمة والتنقل / Navigation</h2>
      <label className="flex gap-2"><input type="checkbox" checked={draft.collapsed} onChange={e => setDraft(d => ({ ...d, collapsed: e.target.checked }))} />قائمة مصغرة / Compact navigation</label>
      <ReorderList items={draft.navigation} itemKey={n => n.href} onChange={navigation => setDraft(d => ({ ...d, navigation }))} render={(n, i) => <div className="flex flex-wrap gap-3 items-center"><bdi className="min-w-24">{n.href === "/" ? "Dashboard" : n.href.slice(1)}</bdi><label><input type="checkbox" disabled={n.href === "/settings"} checked={!n.hidden} onChange={e => setDraft(d => ({ ...d, navigation: d.navigation.map((x, j) => j === i ? { ...x, hidden: !e.target.checked } : x) }))} /> إظهار / Show</label><label><input type="checkbox" checked={n.pinned} onChange={e => setDraft(d => ({ ...d, navigation: d.navigation.map((x, j) => j === i ? { ...x, pinned: e.target.checked } : x) }))} /> مفضل / Favorite</label><label className="sr-only" htmlFor={`icon-${i}`}>أيقونة {n.href}</label><select id={`icon-${i}`} value={n.icon} onChange={e => setDraft(d => ({ ...d, navigation: d.navigation.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) }))}>{["default", "Dashboard", "Tasks", "HelpDesk", "Settings", "Assets", "Reports"].map(icon => <option key={icon}>{icon}</option>)}</select></div>} />
    </div>
    {info.can_manage_company && <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <h2 className="font-bold">هوية الشركة / Company branding</h2><p className="text-sm">PNG، JPEG، WebP؛ حتى 2MB، من 16 إلى 2048 بكسل. أيقونة الموقع مربعة. / Static images only; square favicon.</p>
      <div className="grid sm:grid-cols-2 gap-4">{(["logo", "favicon"] as const).map(kind => <div key={kind} className="space-y-3 border rounded-lg p-4">
        <label>{kind === "logo" ? "شعار الشركة / Logo" : "أيقونة الموقع / Favicon"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void upload(kind, e.target.files?.[0]); e.target.value = ""; }} /></label>
        {info.branding[kind] ? <><img src={mediaUrl(info.branding[kind]!)} alt={kind} className="h-16 max-w-48 object-contain" /><button disabled={busy} onClick={() => void run(async () => { await api.delete(`/workspace/branding/${kind}`); await reload(); await refreshUser(); })}>إزالة / Remove</button></> : <p>لم تُرفع صورة / No image</p>}
      </div>)}</div>
      <h3 className="font-bold">افتراضيات الشركة / Company defaults</h3><p className="text-sm">احفظ المظهر الحالي كافتراضي، وحدد الخيارات الملزمة للمستخدمين. / Save the current appearance as default and select enforced fields.</p>
      <div className="flex flex-wrap gap-3">{Object.keys(defaultAppearance).map(key => <label key={key} className="flex gap-1"><input type="checkbox" checked={enforced.includes(key)} onChange={e => setEnforced(values => e.target.checked ? [...values, key] : values.filter(v => v !== key))} /><bdi>{key}</bdi></label>)}</div>
      <button disabled={busy} onClick={() => void run(async () => { await api.put("/workspace/company-defaults", { appearance: draft.appearance, enforced }); await reload(); })}>حفظ افتراضيات {activeCompanyId ? "الشركة" : ""} / Save company defaults</button>
    </div>}
    <div className="sticky bottom-4 z-20 bg-white border rounded-xl p-4 shadow-lg space-y-3">
      <div role="status" aria-live="polite">{message}</div>{failure && <p role="alert" className="text-red-700">{failure}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={busy} className="workspace-primary" onClick={() => void run(() => save())}>{busy ? "جارٍ الحفظ… / Saving…" : "حفظ / Save"}</button><button disabled={busy} onClick={() => { cancel(); setMessage(""); }}>إلغاء / Cancel</button><button disabled={busy} onClick={() => setDraft(d => ({ ...d, appearance: { ...defaultAppearance, ...Object.fromEntries(info.enforced.map(k => [k, info.company_defaults[k as keyof Appearance]])) } }))}>استعادة المظهر الافتراضي / Restore appearance defaults</button></div>
    </div>
  </section>;
}
