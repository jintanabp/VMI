"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * กล่องยืนยันแทน window.confirm()
 * `confirm()` บล็อก main thread และบน webview ดูเหมือนแอปค้าง
 * (โครงเดียวกับ components/stock/stop-order-modal.tsx ที่ใช้อยู่แล้ว)
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setPending(false);
  }, [open]);

  // Esc ปิดได้ — ผู้ใช้คุ้นกับพฤติกรรมนี้จาก confirm() เดิม
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open || typeof document === "undefined") return null;

  async function run() {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          {tone === "danger" && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          {title}
        </h3>
        {body && (
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {body}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={tone === "danger" ? "destructive" : "default"}
            pending={pending}
            onClick={() => void run()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
