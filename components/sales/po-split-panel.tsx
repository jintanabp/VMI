"use client";

import { useMemo } from "react";
import { AlertTriangle, FileText, Merge, MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  calcNetUnitPrice,
  formatBaht,
  formatNumber,
  resolveOrderLinePrice,
} from "@/lib/calculations";
import {
  nextFreeGroupKey,
  proposePoSplit,
  validatePoSplit,
  type PoSplitGroup,
  type SplittableItem,
} from "@/lib/po/split-plan";
import { promoGroupBadgeClass } from "@/lib/promo/promo-group-display";
import { cn } from "@/lib/utils";
import type { ReviewOrderItem } from "./order-review-table";

/**
 * แผงแบ่ง PO — 1 ออเดอร์ออกได้หลาย PO
 *
 * ระบบเสนอให้ 2 กลุ่ม (ราคาตรง C4 / ไม่ตรง C4) แล้วพนักงานย้ายรายการเองได้
 * ยังไม่เขียน DB จนกว่าจะย้ายจริงหรือกดอนุมัติ — เปิดดูเฉย ๆ ไม่ทำให้ข้อมูลเปลี่ยน
 */
export function toSplittable(items: ReviewOrderItem[]): SplittableItem[] {
  // ตรงกับ approve-with-split.ts: บรรทัด 0 หีบนอกโปรกลุ่มไม่ขึ้น PO จึงไม่นับในการแบ่งใบ
  return items.filter((i) => i.finalQty > 0 || i.c4PromoGroup).map((item) => {
    const { unitPrice } = resolveOrderLinePrice({
      salesPriceOverride: item.salesPriceOverride,
      unitPriceOverride: item.unitPriceOverride,
      c4UnitPrice: item.c4UnitPrice,
    });
    return {
      id: item.id,
      skuCode: item.sku.code,
      skuName: item.sku.name,
      finalQty: item.finalQty,
      priceFlagged: item.priceFlagged,
      qtyEdited:
        item.requestedQty != null &&
        item.finalQty > 0 &&
        item.finalQty !== item.requestedQty,
      // ตรงกับ approve-with-split.ts — ให้ด่านกลุ่มโปรห้ามแยก PO ทำงานบนจอด้วย
      promoGroup: item.c4PromoGroup ?? null,
      promoGroupMembers: item.c4PromoGroupMembers ?? null,
      // ส่วนลด C4 คิดทับบนราคาที่มีผล ไม่ใช่ใช้ c4NetUnitPrice ที่คิดจากราคาแคตตาล็อก
      effectiveUnitPrice:
        calcNetUnitPrice(unitPrice, item.c4DiscountBaht, item.c4DiscountPct) ??
        unitPrice,
      poGroup: item.poGroup ?? null,
    };
  });
}

/** สีของกลุ่ม PO — ใช้ระบบสีเดียวกับกลุ่มโปรที่ผู้ใช้คุ้นจากหน้า stock */
export function poGroupStripe(groupKey: string): 0 | 1 | 2 | 3 {
  return ((groupKey.charCodeAt(0) - 65) % 4) as 0 | 1 | 2 | 3;
}

export function PoSplitPanel({
  items,
  selectedIds,
  onAssign,
  pending,
}: {
  items: ReviewOrderItem[];
  selectedIds: Set<string>;
  /** ย้ายรายการที่เลือกไปกลุ่มที่ระบุ */
  onAssign: (groupKey: string, itemIds: string[]) => void;
  pending?: boolean;
}) {
  const splittable = useMemo(() => toSplittable(items), [items]);
  const groups: PoSplitGroup[] = useMemo(
    () => proposePoSplit(splittable),
    [splittable]
  );
  const issues = useMemo(() => validatePoSplit(splittable), [splittable]);

  const selectedCount = selectedIds.size;
  const usedKeys = groups.map((g) => g.groupKey);
  const newKey = nextFreeGroupKey(usedKeys);

  // ยังไม่ถูก persist = ทุกบรรทัดยัง poGroup = null (ระบบแค่เสนอให้)
  const isProposal = splittable.every((i) => !i.poGroup);

  if (groups.length === 0) return null;

  // ใบเดียวและยังไม่ได้ติ๊กอะไร = ไม่มีอะไรให้ตัดสินใจ — ย่อเหลือบรรทัดเดียว ไม่ดันตารางลง
  if (groups.length === 1 && selectedCount === 0 && issues.length === 0) {
    const g = groups[0]!;
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-900/40">
        <FileText className="h-3.5 w-3.5 text-slate-500" />
        <span className="font-bold text-slate-700 dark:text-slate-200">ออก PO ใบเดียว</span>
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 font-bold ring-1",
            promoGroupBadgeClass(poGroupStripe(g.groupKey))
          )}
        >
          PO-{g.groupKey}
        </span>
        <span className="text-slate-600 dark:text-slate-300">{g.label}</span>
        <span className="text-slate-400">· ติ๊กรายการเพื่อแยกใบ หรืออนุมัติเฉพาะที่เลือก</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <FileText className="h-3.5 w-3.5" />
          แบ่งเป็น {groups.length} PO
        </p>
        {isProposal && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
            ระบบเสนอ — ปรับได้ก่อนอนุมัติ
          </span>
        )}
        {selectedCount > 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            ติ๊กไว้ {selectedCount} รายการ — ย้ายไปใบอื่นได้ที่นี่ หรือกด «อนุมัติเฉพาะที่เลือก» ด้านล่าง
          </span>
        )}
        {groups.length > 1 && (
          // รวมทุกบรรทัดกลับเป็นใบเดียวในคลิกเดียว — เดิมต้องติ๊กทุกแถวแล้วกด "รวมกลับ PO-A"
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 px-2.5 text-[11px] font-semibold"
            disabled={pending}
            title="ย้ายทุกรายการไปอยู่ PO-A ใบเดียว"
            onClick={() => onAssign("A", items.map((i) => i.id))}
          >
            <Merge className="h-3.5 w-3.5" />
            รวมเป็น PO เดียว
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => (
          <div
            key={g.groupKey}
            className={cn(
              "rounded-lg border bg-white px-2.5 py-2 dark:bg-slate-900",
              g.priceKind === "c4"
                ? "border-emerald-200 dark:border-emerald-900/60"
                : g.priceKind === "override"
                  ? "border-amber-200 dark:border-amber-900/60"
                  : "border-slate-200 dark:border-slate-700"
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1",
                  promoGroupBadgeClass(poGroupStripe(g.groupKey))
                )}
              >
                PO-{g.groupKey}
              </span>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {g.label}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {formatNumber(g.itemCount, 0)} รายการ ·{" "}
              {formatNumber(g.totalQty, 0)} หีบ ·{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {formatBaht(g.totalAmount)}
              </span>
            </p>
            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 w-full px-2 text-[11px]"
                disabled={pending}
                onClick={() => onAssign(g.groupKey, [...selectedIds])}
              >
                <MoveRight className="h-3.5 w-3.5" />
                ย้าย {selectedCount} รายการมา PO-{g.groupKey}
              </Button>
            )}
          </div>
        ))}
      </div>

      {selectedCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            onClick={() => onAssign(newKey, [...selectedIds])}
          >
            เพิ่มกลุ่มใหม่ (PO-{newKey})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            title="รวมทุกรายการที่เลือกกลับไป PO-A"
            onClick={() => onAssign("A", [...selectedIds])}
          >
            <Merge className="h-3.5 w-3.5" />
            รวมกลับ PO-A
          </Button>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-red-50 px-2.5 py-2 dark:bg-red-950/30">
          {issues.map((msg) => (
            <li
              key={msg}
              className="flex items-start gap-1.5 text-[11px] leading-snug text-red-700 dark:text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ใช้กั้นปุ่มอนุมัติจากฝั่ง client (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นเสมอ) */
export function poSplitIssues(items: ReviewOrderItem[]): string[] {
  return validatePoSplit(toSplittable(items));
}

/**
 * ย้ายบางรายการไปกลุ่มที่ระบุ แล้วแช่กลุ่มที่ระบบเสนอให้บรรทัดที่เหลือไปพร้อมกัน
 *
 * เดิมส่งแค่รายการที่ติ๊ก — พอมีบรรทัดหนึ่งมี poGroup แล้ว บรรทัดที่เหลือ (ยังเป็นแค่ข้อเสนอ)
 * กลายเป็น "ยังไม่ได้จัดกลุ่ม" ใน validatePoSplit จนอนุมัติไม่ได้ ทั้งที่จอโชว์ว่าอยู่ PO-A
 */
export function assignmentsFor(
  items: ReviewOrderItem[],
  groupKey: string,
  movedIds: string[]
): { itemId: string; poGroup: string }[] {
  const moved = new Set(movedIds);
  const proposed = new Map<string, string>();
  for (const g of proposePoSplit(toSplittable(items))) {
    for (const id of g.itemIds) proposed.set(id, g.groupKey);
  }
  return items
    .filter((i) => moved.has(i.id) || proposed.has(i.id))
    .map((i) => ({ itemId: i.id, poGroup: moved.has(i.id) ? groupKey : proposed.get(i.id)! }));
}

/** จำนวน PO ที่จะออก — ใช้ทำข้อความบนปุ่มอนุมัติ */
export function poSplitCount(items: ReviewOrderItem[]): number {
  return proposePoSplit(toSplittable(items)).length;
}
