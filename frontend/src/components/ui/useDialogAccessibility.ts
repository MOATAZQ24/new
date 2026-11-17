"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useDialogAccessibility<T extends HTMLElement>(
  active: boolean,
  dialogRef: RefObject<T | null>,
  onEscape?: () => void,
) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.offsetParent !== null);
    const isTopmostDialog = () => Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
    ).slice(-1)[0] === dialog;

    const frame = window.requestAnimationFrame(() => {
      if (!isTopmostDialog()) return;
      const initialFocus = dialog.querySelector<HTMLElement>("[autofocus]") || getFocusable()[0];
      (initialFocus || dialog).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostDialog()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const remainingDialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      ).filter(other => other !== dialog);
      document.body.style.overflow = remainingDialogs.length ? "hidden" : previousOverflow;
      if (
        previouslyFocused?.isConnected &&
        (!remainingDialogs.length || remainingDialogs.some(other => other.contains(previouslyFocused)))
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, dialogRef]);
}
