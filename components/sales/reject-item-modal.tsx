"use client";

import { useEffect, useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * ปฏิเสธรายการเดียวในออเดอร์ — คนละอันกับ RejectOrderModal ที่ปฏิเสธทั้งใบ
 *
 * ใช้ชุด quick reason เดียวกับการปฏิเสธทั้งใบเพื่อความคุ้นเคย แต่แสดงบริบทเป็น
 * SKU/ชื่อสินค้าแทนร้าน/จำนวนรวม
 */
const QUICK_REASONS = [
  "สต็อกยังพอ",
  "ราคาไม่ถูกต้อง",
  "เกิน MAX",
  "รอรอบส่งถัดไป",
] as const;

export function RejectItemModal({
  open,
  skuCode,
  skuName,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  skuCode: string;
  skuName: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      size="md"
      labelledBy="reject-item-title"
    >
      <ModalBody className="pt-4 sm:pt-5">
        <h3
          id="reject-item-title"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
        >
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
          ปฏิเสธรายการนี้
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono font-semibold">{skuCode}</span> · {skuName}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          ตั้งจำนวนเป็น 0 — ยังอยู่ในออเดอร์แต่ไม่ถูกส่งเข้า PO
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
          rows={2}
          autoFocus
          placeholder="พิมพ์เหตุผลเพิ่มเติม (ไม่บังคับ)"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </ModalBody>

      <ModalFooter>
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
      </ModalFooter>
    </Modal>
  );
}
