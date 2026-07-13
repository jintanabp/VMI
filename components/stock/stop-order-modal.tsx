"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StopOrderModal({
  open,
  selectedCount,
  skuIds,
  onClose,
  onSuccess,
}: {
  open: boolean;
  selectedCount: number;
  skuIds: string[];
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setEffectiveFrom("");
    setError("");
    setSaving(false);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  async function submit() {
    if (skuIds.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/store/blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuIds,
          reason: reason.trim(),
          effectiveFrom: effectiveFrom || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ"
        );
        return;
      }
      setReason("");
      setEffectiveFrom("");
      await onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Ban className="h-4 w-4 text-red-500" />
          หยุดสั่ง {selectedCount} รายการ
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          ระบบจะไม่แนะนำสั่งสินค้าเหล่านี้ตั้งแต่วันที่กำหนด และแจ้งเซลล์ที่ดูแลร้าน
        </p>

        <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          เหตุผล
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="เช่น สินค้าเลิกขาย / ไม่มีที่เก็บ / ขายไม่ดี"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
        />

        <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          เริ่มหยุดสั่งตั้งแต่
        </label>
        <input
          type="datetime-local"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <p className="mt-1 text-[11px] text-slate-400">เว้นว่าง = เริ่มทันที</p>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            ยกเลิก
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void submit()}
            disabled={saving || !reason.trim()}
          >
            {saving ? "กำลังบันทึก..." : "ยืนยันหยุดสั่ง"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
