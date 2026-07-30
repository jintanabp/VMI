"use client";

import {
  formatPromoTierLabelVerbose,
  isBenefitTier,
  type PromoTierInput,
} from "@/lib/calculations";
import { cn } from "@/lib/utils";

/**
 * ขั้นบันไดโปรทั้งชุดในบรรทัดเดียว พร้อมไฮไลต์ขั้นที่ได้อยู่ตอนนี้
 *
 * นี่คือสิ่งที่ทำให้มุมมองโปรต่างจากตารางปกติจริง ๆ — ตารางบอกได้แค่ขั้นปัจจุบัน
 * กับขั้นถัดไป ส่วนร้านที่สั่งของโดยดูโปรเป็นหลักอยากเห็นทั้งบันไดพร้อมกัน
 */
export function PromoLadderStrip({
  tiers,
  pooledQty,
  className,
}: {
  tiers: PromoTierInput[];
  pooledQty: number;
  className?: string;
}) {
  const steps = [...(tiers ?? [])]
    .filter(isBenefitTier)
    .sort((a, b) => a.minQty - b.minQty);
  if (steps.length === 0) return null;

  // ขั้นที่ active = ขั้นสูงสุดที่ยอดถึงแล้ว (กติกาเดียวกับที่ใช้คิดราคา)
  let activeIdx = -1;
  steps.forEach((t, i) => {
    if (pooledQty >= t.minQty) activeIdx = i;
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {steps.map((t, i) => {
        const reached = i <= activeIdx;
        const isActive = i === activeIdx;
        return (
          <span
            key={`${t.minQty}-${i}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight ring-1",
              isActive
                ? "bg-teal-600 font-semibold text-white ring-teal-600"
                : reached
                  ? "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800"
                  : "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700"
            )}
            title={formatPromoTierLabelVerbose(t)}
          >
            {isActive && <span aria-hidden>✓</span>}
            {formatPromoTierLabelVerbose(t) || `ซื้อ ${t.minQty}+ หีบ`}
          </span>
        );
      })}
    </div>
  );
}
