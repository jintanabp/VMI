"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { StockQtyStepper } from "@/components/stock/stock-qty-stepper";
import { formatDays, getOrderCvdFlag } from "@/lib/calculations";
import { cvdFlagHint } from "@/lib/stock/cvd-hint";
import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import {
  nextPromoStepQty,
  prevPromoStepQty,
  promoStepLot,
} from "@/lib/promo/promo-step";
import type { StockRowComputed } from "@/lib/repositories/types";

/** ขั้นโปรที่บังคับกับบรรทัดนี้ได้ — โปรกลุ่มคุมที่ยอดรวม ไม่ใช่รายบรรทัด */
function stepTiersOf(row: StockRowComputed) {
  if (isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) return null;
  return row.promoTiers ?? null;
}

/**
 * กล่องตรวจก่อนไปหน้า order
 *
 * เดิมเป็น ConfirmDialog ที่บอกแค่ "มี N รายการที่จำนวนยังไม่เข้าเป้าหมาย" — ไม่บอกว่า
 * ตัวไหน และแก้ในกล่องไม่ได้ ผู้ใช้จึงต้องเดาว่าต้องกลับไปหาแถวไหนในตารางเป็นร้อยแถว
 *
 * ตัวนี้ไม่เก็บ state ของตัวเอง: รายการที่ติดธงคำนวณสดจาก rows + qtyOf ซึ่งเป็น state
 * ของหน้าสต็อก พอผู้ใช้แก้จำนวนในกล่อง แถวที่หายปัญหาจะหลุดออกจากลิสต์เอง
 */
export function OrderReviewDialog({
  open,
  rows,
  qtyOf,
  suggestRemaining,
  onSetQty,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** รายการที่ติ๊กไว้ทั้งหมด — คอมโพเนนต์คัดเองว่าอันไหนยังติดธง */
  rows: StockRowComputed[];
  qtyOf: (row: StockRowComputed) => number;
  /**
   * จำนวนแนะนำที่หักของค้างในออเดอร์ที่ยังไม่อนุมัติแล้ว — ต้องใช้ตัวเดียวกับตาราง /stock
   * ไม่ใช่ row.suggestOrder ดิบ ไม่งั้นกล่องนี้จะบอก "แนะนำ 10" ขณะที่ตารางบอก "แนะนำอีก 4"
   * แล้วพาผู้ใช้สั่งซ้ำที่กลไก pendingQty ตั้งใจกันไว้
   */
  suggestRemaining: (row: StockRowComputed) => number;
  onSetQty: (skuCode: string, qty: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const flagged = useMemo(
    () =>
      rows.flatMap((row) => {
        const qty = qtyOf(row);
        const { flag, reason, blocking, cvdEst } = getOrderCvdFlag(
          row.stock,
          qty,
          row.avgSales,
          row.minDays,
          row.maxDays
        );
        if (!blocking || flag == null) return [];
        return [{ row, qty, cvdEst, hint: cvdFlagHint(flag, reason, row) }];
      }),
    [rows, qtyOf]
  );

  const empty = rows.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      sheetOnMobile
      labelledBy="order-review-title"
    >
      <ModalBody className="pt-4 sm:pt-5">
        <h3
          id="order-review-title"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
        >
          {flagged.length > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          )}
          ยืนยันจำนวนที่สั่ง
        </h3>

        {flagged.length > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              มี {flagged.length} รายการที่จำนวนยังไม่เข้าเป้าหมาย MIN/MAX —
              ปรับได้ที่นี่เลย หรือส่งต่อไปให้พนักงานตรวจก็ได้
              (พนักงานจะเห็นธงเตือนนี้ด้วย)
            </p>
            <ul className="mt-3 space-y-2">
              {flagged.map(({ row, qty, cvdEst, hint }) => (
                <li
                  key={row.skuId}
                  className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/20"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug text-teal-700 dark:text-teal-400">
                        {row.skuCode}
                      </p>
                      <p className="mt-0.5 line-clamp-2 break-words text-sm text-slate-800 dark:text-slate-200">
                        {row.skuName}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <StockQtyStepper
                        qty={qty}
                        suggestOrder={suggestRemaining(row)}
                        promoStepLot={promoStepLot(stepTiersOf(row), qty)}
                        // เดินทีละขั้นโปร — ±1 จะโดนหน้าแม่ปัดกลับที่เดิมจนปุ่มกดไม่ขยับ
                        onMinus={() =>
                          onSetQty(row.skuCode, prevPromoStepQty(stepTiersOf(row), qty))
                        }
                        onPlus={() =>
                          onSetQty(row.skuCode, nextPromoStepQty(stepTiersOf(row), qty))
                        }
                        onSetQty={(n) => onSetQty(row.skuCode, n)}
                        onApplySuggest={() =>
                          onSetQty(row.skuCode, suggestRemaining(row))
                        }
                        showSuggestChip
                        compact
                      />
                      <span className="vmi-t-xs tabular-nums text-slate-500 dark:text-slate-400">
                        CVD หลังสั่ง {formatDays(cvdEst)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 vmi-t-xs text-amber-800 dark:text-amber-300">
                    {hint}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {empty
              ? "ไม่มีรายการที่เลือกแล้ว — ปิดกล่องนี้แล้วเลือกสินค้าที่ต้องการสั่ง"
              : "จำนวนเข้าเป้าหมายทุกรายการแล้ว — กดตรวจสอบคำสั่งเพื่อไปหน้าถัดไป"}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button size="sm" variant="outline" onClick={onClose}>
          แก้ต่อ
        </Button>
        <Button size="sm" disabled={empty} onClick={onConfirm}>
          ตรวจสอบคำสั่ง{rows.length > 0 ? ` (${rows.length})` : ""}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
