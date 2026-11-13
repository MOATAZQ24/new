"use client";
import { useState } from "react";

/** Pointer drag and keyboard buttons share the same ordering operation. */
export function ReorderList<T>({ items, itemKey, render, onChange }: {
  items: T[]; itemKey: (item: T) => string; render: (item: T, index: number) => React.ReactNode; onChange: (items: T[]) => void;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next);
  };
  return <ul className="space-y-2">{items.map((item, i) => <li key={itemKey(item)}
    onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragged !== null) move(dragged, i); setDragged(null); }}
    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 bg-white">
    <span draggable onDragStart={() => setDragged(i)} onDragEnd={() => setDragged(null)} className="cursor-grab" aria-hidden="true">⠿</span>
    <div className="flex-1 min-w-0">{render(item, i)}</div>
    <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`نقل لأعلى / Move up ${i + 1}`}>↑</button>
    <button type="button" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`نقل لأسفل / Move down ${i + 1}`}>↓</button>
  </li>)}</ul>;
}
