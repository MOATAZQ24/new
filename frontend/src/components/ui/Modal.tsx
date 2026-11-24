"use client";
/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import React, { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Input } from "./input";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, description, children, footer, maxWidth = "max-w-xl" }: ModalProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:opacity-100 transition-opacity duration-[var(--dur-mid)]" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed z-50 start-1/2 top-1/2 -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2",
            "w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-14)] border border-[var(--border)]",
            "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-e3)] max-h-[88vh] flex flex-col outline-none",
            "ig-scale-in transition-all duration-[var(--dur-fast)]",
            maxWidth
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[16px] font-semibold leading-[1.4] text-[var(--text)]">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-[13px] text-[var(--text-2)]">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="إغلاق النافذة" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-6)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] cursor-pointer">
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4 text-start flex-1">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireTypedConfirmation?: string;
  loading?: boolean;
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel = "تأكيد", cancelLabel = "إلغاء", destructive = false, requireTypedConfirmation, loading = false }: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const canConfirm = !requireTypedConfirmation || typed.trim() === requireTypedConfirmation.trim();
  const handleClose = () => { setTyped(""); onClose(); };
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={async () => { await onConfirm(); setTyped(""); }} disabled={!canConfirm || loading} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {destructive && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-6)] bg-[var(--danger-soft)] text-[var(--danger-text)]">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 space-y-3">
          <p className="text-[14px] leading-[1.6] text-[var(--text-2)]">{description}</p>
          {requireTypedConfirmation && (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--text)]">
                اكتب <bdi className="font-semibold text-[var(--danger-text)]">{requireTypedConfirmation}</bdi> للتأكيد:
              </label>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireTypedConfirmation} autoFocus />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
export default Modal;
