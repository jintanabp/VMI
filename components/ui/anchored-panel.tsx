"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** แผงลอยที่เกาะกับปุ่ม — วางผ่าน portal เพื่อไม่ให้โดน overflow ของตารางตัด */
export function AnchoredPanel({
  open,
  onClose,
  anchorRef,
  width = 320,
  children,
  /** ค่าที่เปลี่ยนแล้วต้องคำนวณตำแหน่งใหม่ (ความสูงแผงเปลี่ยน) */
  reflowKey,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  width?: number;
  children: ReactNode;
  reflowKey?: unknown;
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !panelRef.current) return;

    function position() {
      const trigger = anchorRef.current!.getBoundingClientRect();
      const panel = panelRef.current!;
      const margin = 12;
      const gap = 6;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - margin * 2);

      const left = Math.max(
        margin,
        Math.min(trigger.right - w, vw - w - margin)
      );

      const belowTop = trigger.bottom + gap;
      const panelHeight = panel.offsetHeight;
      const spaceBelow = vh - margin - belowTop;
      const spaceAbove = trigger.top - gap - margin;

      let top = belowTop;
      let maxHeight = spaceBelow;
      if (panelHeight > spaceBelow && spaceAbove > spaceBelow) {
        maxHeight = spaceAbove;
        top = Math.max(
          margin,
          trigger.top - gap - Math.min(panelHeight, maxHeight)
        );
      }
      maxHeight = Math.max(180, Math.min(maxHeight, vh - top - margin));

      setStyle({
        position: "fixed",
        top,
        left,
        width: w,
        maxHeight,
        zIndex: 9999,
        visibility: "visible",
      });
    }

    position();
    const raf = requestAnimationFrame(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, width, anchorRef, reflowKey]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      {children}
    </div>,
    document.body
  );
}

export function PanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </p>
      <button
        type="button"
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        onClick={onClose}
        aria-label="ปิด"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
