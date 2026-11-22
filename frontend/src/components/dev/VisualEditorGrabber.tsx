"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */


import { useEffect, useState, useRef } from "react";
import { useFeatureFlags } from "@/lib/featureFlags";
import { X, Copy, Check, Eye, Edit3, Move, Sparkles } from "lucide-react";

interface InspectedElementInfo {
  tagName: string;
  id: string;
  classes: string;
  text: string;
  componentHint?: string;
  rect: DOMRect;
  domNode: HTMLElement;
}

export function VisualEditorGrabber() {
  const { flags } = useFeatureFlags();
  const [active, setActive] = useState(false);
  const [hoveredEl, setHoveredEl] = useState<HTMLElement | null>(null);
  const [selectedEl, setSelectedEl] = useState<InspectedElementInfo | null>(null);
  const [editedClasses, setEditedClasses] = useState("");
  const [editedText, setEditedText] = useState("");
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const selectedDomRef = useRef<HTMLElement | null>(null);

  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) {
      setHoveredEl(null);
    }
  }

  // Shortcut Ctrl + Shift + E to toggle inspector
  useEffect(() => {
    if (!flags.visualEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        setActive((prev) => !prev);
      }
      if (e.key === "Escape" && active) {
        setActive(false);
        setSelectedEl(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flags.visualEditing, active]);

  // Mouse hover listener while inspector is active
  useEffect(() => {
    if (!active) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Don't inspect inspector's own UI
      const target = e.target as HTMLElement;
      if (target?.closest("#investor-gate-dev-inspector")) return;

      setHoveredEl(target);
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest("#investor-gate-dev-inspector")) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = target.getBoundingClientRect();
      const hint = target.getAttribute("data-component") || target.getAttribute("data-testid") || target.getAttribute("aria-label") || undefined;

      const info: InspectedElementInfo = {
        tagName: target.tagName.toLowerCase(),
        id: target.id || "",
        classes: target.className || "",
        text: target.childNodes.length === 1 && target.childNodes[0].nodeType === Node.TEXT_NODE
          ? target.textContent || ""
          : "",
        componentHint: hint,
        rect,
        domNode: target,
      };

      selectedDomRef.current = target;
      setSelectedEl(info);
      setEditedClasses(typeof target.className === "string" ? target.className : "");
      setEditedText(info.text);
    };

    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active]);

  // Apply real-time edits directly to selected DOM node
  const handleApplyEdits = () => {
    if (!selectedEl?.domNode) return;
    try {
      selectedEl.domNode.className = editedClasses;
      if (editedText && selectedEl.domNode.childNodes.length === 1 && selectedEl.domNode.childNodes[0].nodeType === Node.TEXT_NODE) {
        selectedEl.domNode.textContent = editedText;
      }
    } catch (e) {
      console.warn("[DevToolkit] Could not apply DOM edit:", e);
    }
  };

  const handleCopyJSX = () => {
    if (!selectedEl) return;
    const tag = selectedEl.tagName;
    const jsxSnippet = `<${tag} className="${editedClasses}">${editedText ? editedText : "..."}</${tag}>`;
    navigator.clipboard.writeText(jsxSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!flags.visualEditing) return null;

  const hoverRect = hoveredEl?.getBoundingClientRect();

  return (
    <div id="investor-gate-dev-inspector" className="fixed z-[999999] pointer-events-none select-none font-sans">
      {/* Floating Activator Toggle */}
      <button
        type="button"
        onClick={() => setActive(!active)}
        title={active ? "إيقاف المفتش المرئي (Ctrl+Shift+E)" : "تفعيل المفتش المرئي والتعديل الفوري (Ctrl+Shift+E)"}
        className={`pointer-events-auto fixed bottom-5 left-5 flex items-center gap-2 px-3.5 py-2 rounded-full shadow-2xl text-xs font-semibold backdrop-blur-md transition-all duration-300 border ${
          active
            ? "bg-purple-600 text-white border-purple-400 ring-4 ring-purple-500/20 shadow-purple-500/30 scale-105"
            : "bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800"
        }`}
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
        <span>{active ? "المفتش نشط (React Grab)" : "مفتش الواجهة"}</span>
        <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-purple-200 border border-slate-700">Ctrl+Shift+E</span>
      </button>

      {/* Hover Outline Box */}
      {active && hoverRect && !selectedEl && (
        <div
          className="fixed border-2 border-purple-500 bg-purple-500/10 pointer-events-none transition-all duration-75 rounded"
          style={{
            top: `${hoverRect.top}px`,
            left: `${hoverRect.left}px`,
            width: `${hoverRect.width}px`,
            height: `${hoverRect.height}px`,
          }}
        >
          <div className="absolute -top-6 left-0 bg-purple-700 text-white text-[11px] font-mono px-2 py-0.5 rounded shadow">
            {hoveredEl?.tagName.toLowerCase()}
            {hoveredEl?.id && `#${hoveredEl.id}`}
            {hoveredEl?.className && typeof hoveredEl.className === "string" && (
              <span className="text-purple-200 ml-1">
                .{hoveredEl.className.split(" ")[0]}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Selected Element Editor Panel */}
      {selectedEl && (
        <div className="pointer-events-auto fixed bottom-20 left-5 w-96 max-h-[80vh] overflow-y-auto bg-slate-950/95 text-slate-100 border border-purple-500/40 rounded-xl shadow-2xl backdrop-blur-lg p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-200">
                محرر العنصر &lt;{selectedEl.tagName}&gt;
              </h3>
            </div>
            <button
              onClick={() => setSelectedEl(null)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedEl.componentHint && (
            <div className="text-[11px] bg-purple-950/60 text-purple-300 border border-purple-800/40 px-2.5 py-1 rounded">
              مكون: <span className="font-mono font-semibold">{selectedEl.componentHint}</span>
            </div>
          )}

          {/* Classes Editor */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-400 font-medium">فئات Tailwind / CSS:</label>
            <textarea
              dir="ltr"
              value={editedClasses}
              onChange={(e) => {
                setEditedClasses(e.target.value);
                if (selectedDomRef.current) selectedDomRef.current.className = e.target.value;
              }}
              rows={3}
              className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-md p-2 text-purple-200 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
            />
          </div>

          {/* Text Content Editor */}
          {selectedEl.text !== "" && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-slate-400 font-medium">النص المباشر:</label>
              <input
                type="text"
                value={editedText}
                onChange={(e) => {
                  setEditedText(e.target.value);
                  if (selectedDomRef.current) selectedDomRef.current.textContent = e.target.value;
                }}
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-purple-400"
              />
            </div>
          )}

          {/* Preset Quick Actions */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] text-slate-500 w-full">إضافات سريعة:</span>
            {[
              { label: "ظل بارز", cls: "shadow-xl shadow-purple-500/20" },
              { label: "حواف دائرية", cls: "rounded-2xl" },
              { label: "حد بنفسجي", cls: "border-2 border-purple-500" },
              { label: "خلفية داكنة", cls: "bg-slate-900/90 text-white" },
              { label: "تكبير الحجم", cls: "scale-105 transition-transform" },
            ].map((preset) => (
              <button
                key={preset.cls}
                type="button"
                onClick={() => {
                  const updated = `${editedClasses} ${preset.cls}`.trim();
                  setEditedClasses(updated);
                  if (selectedEl.domNode) selectedEl.domNode.className = updated;
                }}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 hover:border-purple-400 transition-colors"
              >
                + {preset.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleCopyJSX}
              className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "تم النسخ!" : "نسخ JSX / Classes"}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedEl(null)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1.5 px-3 rounded-lg"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default VisualEditorGrabber;
