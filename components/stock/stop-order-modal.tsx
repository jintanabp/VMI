"use client";

import { appPath } from "@/lib/paths";
import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

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
  const [effectiveTo, setEffectiveTo] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setPermanent(true);
    setError("");
    setSaving(false);
  }, [open]);

  async function submit() {
    if (skuIds.length === 0) return;
    if (!permanent && !effectiveTo) {
      setError("ระบุวันที่สิ้นสุด หรือติ๊ก “หยุดสั่งถาวร”");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/store/blocklist"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuIds,
          reason: reason.trim(),
          effectiveFrom: effectiveFrom || undefined,
          effectiveTo: permanent ? undefined : effectiveTo,
          permanent,
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
      setEffectiveTo("");
      await onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="md"
      labelledBy="stop-order-title"
    >
      <ModalBody className="pt-4 sm:pt-5">
        <h3
          id="stop-order-title"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
        >
          <Ban className="h-4 w-4 shrink-0 text-red-500" />
          หยุดสั่ง {selectedCount} รายการ
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          ระบบจะไม่แนะนำสั่งสินค้าเหล่านี้ในช่วงวันที่กำหนด และแจ้งเซลล์ที่ดูแลร้าน
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

        {/* datetime-local เป็นคอนโทรลเนทีฟที่กว้าง — สองคอลัมน์บนจอ ~360px จะโดนตัด */}
        <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              ตั้งแต่วันที่
            </label>
            <input
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="mt-1 text-[11px] text-slate-400">เว้นว่าง = เริ่มทันที</p>
          </div>
          <div>
            <label
              className={cn(
                "block text-xs font-semibold text-slate-600 dark:text-slate-300",
                permanent && "text-slate-400 dark:text-slate-600"
              )}
            >
              ถึงวันที่
            </label>
            <input
              type="datetime-local"
              value={effectiveTo}
              disabled={permanent}
              min={effectiveFrom || undefined}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500/30 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {permanent ? "หยุดถาวร" : "กลับมาแนะนำสั่งหลังวันนี้"}
            </p>
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
          <Checkbox
            checked={permanent}
            onCheckedChange={(v) => {
              const next = v === true;
              setPermanent(next);
              if (next) setEffectiveTo("");
            }}
          />
          หยุดสั่งถาวร (ไม่กำหนดวันสิ้นสุด)
        </label>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
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
      </ModalFooter>
    </Modal>
  );
}
