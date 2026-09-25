"use client";

import { useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { SkuPicker, type SkuHit } from "./sku-picker";

/**
 * เพิ่มสินค้าใหม่ (SKU ที่ไม่เคยอยู่ในออเดอร์) เข้าออเดอร์ที่ร้านส่งมาแล้ว
 *
 * สองขั้นตอน: ค้นหา/เลือกสินค้า (SkuPicker) แล้วกรอกจำนวน — บรรทัดที่เพิ่มจะรอร้านยืนยันก่อน
 * เข้า PO ได้เสมอ (ดู server: requestedQty แช่เป็น 0 เข้าเงื่อนไข "เพิ่มจำนวน" ของเดิมโดยอัตโนมัติ)
 */
export function AddOrderItemModal({
  open,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (skuCode: string, finalQty: number) => void;
}) {
  const [selected, setSelected] = useState<SkuHit | null>(null);
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setQty("1");
    }
  }, [open]);

  const qtyNum = Number.parseInt(qty, 10);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum >= 1 && qtyNum <= 100_000;

  if (!selected) {
    return (
      <SkuPicker open={open} onClose={onClose} onPick={(hit) => setSelected(hit)} />
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" labelledBy="add-order-item-title">
      <ModalBody className="pt-4 sm:pt-5">
        <h3
          id="add-order-item-title"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
        >
          <PackagePlus className="h-4 w-4 shrink-0 text-teal-600" />
          เพิ่มสินค้าเข้าออเดอร์
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono font-semibold">{selected.code}</span> ·{" "}
          {selected.name}
        </p>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          รายการนี้จะรอร้านยืนยันก่อนถึงจะเข้า PO ได้ (เหมือนกรณีเพิ่มจำนวนเกินที่ร้านขอ)
        </p>

        <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          จำนวน (หีบ)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100_000}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </ModalBody>

      <ModalFooter>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setSelected(null)}
        >
          เลือกสินค้าอื่น
        </Button>
        <Button
          size="sm"
          disabled={!qtyValid || pending}
          pending={pending}
          onClick={() => onSubmit(selected.code, qtyNum)}
        >
          เพิ่มเข้าออเดอร์
        </Button>
      </ModalFooter>
    </Modal>
  );
}
