"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ปฏิเสธออเดอร์ — แทน window.prompt()
 *
 * `prompt()` บล็อก main thread, ก็อปข้อความไม่ได้, และบน webview ดูเหมือนแอปค้าง
 * (โครงเดียวกับ components/stock/stop-order-modal.tsx ที่ใช้อยู่แล้ว)
 */
const QUICK_REASONS = [
  "สต็อกยังพอ",
  "ราคาไม่ถูกต้อง",
  "เกิน MAX",
  "รอรอบส่งถัดไป",
] as const;

export function RejectOrderModal({
  open,
  storeLabel,
  itemCount,
  redFlagCount,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  storeLabel: string;
  itemCount: number;
  redFlagCount: number;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <XCircle className="h-4 w-4 text-red-500" />
          ปฏิเสธออเดอร์
        </h3>
        {/* บอกบริบทให้ครบ เพื่อให้เหตุผลที่พิมพ์ตรงกับใบที่กำลังปฏิเสธจริง */}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {storeLabel} · {itemCount} รายการ
          {redFlagCount > 0 ? ` · ธงแดง ${redFlagCount} รายการ` : ""}
        </p>

        <p className="mt-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
          เหตุผล
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                reason === r
                  ? "bg-red-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="พิมพ์เหตุผลเพิ่มเติม (ไม่บังคับ)"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            variant="destructive"
            pending={pending}
            onClick={() => onConfirm(reason.trim())}
          >
            ยืนยันปฏิเสธ
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
