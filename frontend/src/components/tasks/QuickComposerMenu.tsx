"use client";

import React, { useRef, useEffect } from "react";
import {
  Plus,
  Users,
  Megaphone,
  FileText,
  Mic,
  Camera,
  Paperclip,
  ChevronDown,
} from "lucide-react";

export type ComposerActionType =
  | "new_task"
  | "broadcast"
  | "announcement"
  | "template"
  | "voice"
  | "camera"
  | "file_upload";

interface QuickComposerMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectAction: (action: ComposerActionType) => void;
}

export function QuickComposerMenu({
  isOpen,
  onToggle,
  onClose,
  onSelectAction,
}: QuickComposerMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, onClose]);

  const menuItems: {
    id: ComposerActionType;
    label: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      id: "new_task",
      label: "مهمة جديدة",
      icon: <Plus size={16} />,
      color: "text-primary",
    },
    {
      id: "broadcast",
      label: "إسناد جماعي (Broadcast)",
      icon: <Users size={16} />,
      color: "text-indigo-600",
    },
    {
      id: "announcement",
      label: "إعلان أو تعميم",
      icon: <Megaphone size={16} />,
      color: "text-amber-600",
    },
    {
      id: "template",
      label: "من قالب جاهز",
      icon: <FileText size={16} />,
      color: "text-blue-600",
    },
    {
      id: "voice",
      label: "مهمة صوتية",
      icon: <Mic size={16} />,
      color: "text-emerald-600",
    },
    {
      id: "camera",
      label: "مهمة بالكاميرا",
      icon: <Camera size={16} />,
      color: "text-sky-600",
    },
    {
      id: "file_upload",
      label: "رفع ملف / مرفقات",
      icon: <Paperclip size={16} />,
      color: "text-slate-600",
    },
  ];

  return (
    <div ref={containerRef} className="relative inline-block text-right">
      {/* Primary Trigger Button: + إنشاء مهمة (Reference 1 & 2) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label="خيارات إنشاء المهام السريعة"
        className="bg-primary hover:opacity-90 text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>إنشاء مهمة</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu (Reference 1) */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl py-1.5 z-50 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="py-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectAction(item.id);
                  onClose();
                }}
                className="w-full text-right px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 dark:hover:text-primary flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className={`shrink-0 ${item.color}`}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
