"use client";

import { Button } from "@/components/ui/button";
import { formatBaht } from "@/lib/calculations";

export interface OrderConfirmLine {
  row: { skuId: string; skuCode: string; skuName: string };
  qty: number;
}

interface OrderConfirmModalProps {
  lines: OrderConfirmLine[];
  skuCount: number;
  totalQty: number;
  orderTotal: number | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function OrderConfirmModal({
  lines,
  skuCount,
  totalQty,
  orderTotal,
  pending,
  onCancel,
  onConfirm,
}: OrderConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="vmi-card-elevated flex max-h-[min(32rem,calc(100dvh-4rem))] w-full max-w-md flex-col rounded-2xl p-5 sm:p-6">
        <h3 className="shrink-0 text-lg font-bold">ยืนยันส่งคำสั่งซื้อ?</h3>
        <p className="mt-1 shrink-0 text-sm text-slate-600 dark:text-slate-400">
          {skuCount} รายการ · รวม {totalQty} หีบ
          {orderTotal != null && (
            <>
              {" "}
              · <span className="font-semibold">{formatBaht(orderTotal)}</span>
            </>
          )}
        </p>

        <ul className="vmi-scroll mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm sm:pr-2">
          {lines.map((l) => (
            <li
              key={l.row.skuId}
              className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                  {l.row.skuCode}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {l.row.skuName}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {l.qty} หีบ
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex shrink-0 gap-2 sm:mt-6">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button
            className="flex-1"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "กำลังส่ง..." : "ยืนยัน"}
          </Button>
        </div>
      </div>
    </div>
  );
}
