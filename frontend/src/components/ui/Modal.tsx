import React, { useEffect, useId, useRef, useState } from "react";
import { Icons } from "@/components/ui/Icons";
import { useDialogAccessibility } from "@/components/ui/useDialogAccessibility";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-xl",
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => {
        setIsMounted(true);
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!isMounted) return;

    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 210;
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(false);
      timer = window.setTimeout(() => setIsMounted(false), delay);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [isOpen, isMounted]);

  useDialogAccessibility(isOpen && isMounted, panelRef, onClose);

  if (!isMounted) return null;

  return (
    <div
      aria-hidden={!isVisible}
      className="motion-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      data-open={isVisible}
      role="presentation"
    >
      <div
        ref={panelRef}
        aria-labelledby={titleId}
        aria-modal={isOpen ? "true" : undefined}
        className={`motion-dialog-panel bg-white rounded-2xl shadow-2xl border border-slate-200 w-full ${maxWidth} overflow-hidden`}
        data-open={isVisible}
        role={isOpen ? "dialog" : undefined}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-700 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/70">
          <h3 id={titleId} className="font-bold text-sm text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="motion-control p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Icons.X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[82vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
