"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Gift, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import {
  calcStepPremiumQty,
  formatPremiumUnit,
  formatPromoTierLabel,
  type PromoTierInput,
} from "@/lib/calculations";
import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import {
  hasPromoStep,
  planPromoGroupStepRound,
  planPromoStepRound,
  promoStepLot,
  promoStepRoundReason,
  type PromoGroupStepRound,
  type PromoStepRound,
} from "@/lib/promo/promo-step";
import type { StockRowComputed } from "@/lib/repositories/types";
import { cn } from "@/lib/utils";

/**
 * ขั้นที่ 1 ของการตรวจคำสั่ง — เฉพาะสินค้าที่มีโปรของแถม
 *
 * ของแถมนับเป็นล็อต (floor(ยอด / ล็อต)) เศษที่ไม่ครบล็อตคือของที่ร้านจ่ายเต็มโดยไม่ได้
 * อะไรเพิ่ม เดิมระบบจึงปัดจำนวนเข้าขั้นโปรให้เองทุกจุดที่ตั้งจำนวนได้ ซึ่ง "ดันขึ้น" เสมอ
 * เมื่อยังไม่ถึงขั้นแรก — แนะนำ 1 หีบในโปร 12 แถม 1 กลายเป็นสั่ง 12 หีบเงียบ ๆ
 *
 * ตอนนี้ตารางเก็บเลขที่ร้าน/ระบบตั้งไว้ตรง ๆ แล้วมาตัดสินกันที่นี่ที่เดียว:
 *   ซื้อถึงสัดส่วนของขั้น (30% · ล็อตเกิน 12 หีบใช้ 50%) → ปัดขึ้นไปรับของแถม
 *   ไม่ถึง → ตัดเศษทิ้ง (ยังไม่ซื้อส่วนนั้นรอบนี้)
 * ทุกบรรทัดโชว์เลขเดิมคู่กับเลขใหม่ และกด "ใช้จำนวนเดิม" กลับไปได้เสมอ
 */

type LineItem = {
  kind: "line";
  key: string;
  row: StockRowComputed;
  qty: number;
  round: PromoStepRound | null;
};

type GroupItem = {
  kind: "group";
  key: string;
  group: string;
  rows: StockRowComputed[];
  pool: number;
  round: PromoGroupStepRound | null;
};

type ReviewItem = LineItem | GroupItem;

/** ขั้นของแถมที่คุมจำนวนนี้อยู่ — null = จับคู่ขั้นไม่ได้ (ไม่ควรเกิดกับโปรของแถม) */
function activePremiumTier(
  tiers: StockRowComputed["promoTiers"],
  qty: number
): PromoTierInput | null {
  const lot = promoStepLot(tiers, qty);
  if (lot == null) return null;
  return (
    tiers?.find(
      (t) => t.kind === "premium" && Math.floor(t.minQty) === lot
    ) ?? null
  );
}

/** คำอธิบายขั้นโปรที่กำลังจะถึง — ใช้ป้ายจาก C4 ถ้าจับคู่ขั้นได้ */
function promoTierLabel(row: StockRowComputed, targetQty: number): string {
  const lot = promoStepLot(row.promoTiers, targetQty);
  if (lot == null) return "";
  const tier = activePremiumTier(row.promoTiers, targetQty);
  return tier
    ? `ซื้อ ${lot} หีบ ${formatPromoTierLabel(tier)}`
    : `ขั้นโปรละ ${lot} หีบ`;
}

/**
 * ของแถมที่จะได้จริงจากจำนวนนี้ — คำถามที่ร้านอยากรู้ที่สุดตอนตัดสินใจว่าจะปรับไหม
 *
 * นับแบบเดียวกับที่ระบบคิดของแถมจริง (`floor(ยอด ÷ ล็อต) × ของแถมต่อล็อต`)
 * โปรกลุ่มส่งยอดรวมของกลุ่มเข้ามา ไม่ใช่ยอดรายบรรทัด
 */
function earnedFreeGoods(
  tiers: StockRowComputed["promoTiers"],
  qty: number
): { count: number; unit: string } | null {
  const tier = activePremiumTier(tiers, qty);
  if (!tier) return null;
  return {
    count: calcStepPremiumQty(qty, tier.minQty, tier.premiumQty ?? 0),
    unit: formatPremiumUnit(tier.premiumUnit ?? ""),
  };
}

function QtyChange({ from, to }: { from: number; to: number }) {
  // ร้านกดคงจำนวนเดิมไว้ — โชว์เลขเดียว ไม่ต้องมีลูกศรจากเลขเดิมไปเลขเดิม
  if (from === to) {
    return (
      <span className="rounded-md bg-slate-200 px-1.5 py-px text-sm font-bold tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-200">
        {from} หีบ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="vmi-t-xs text-slate-500 dark:text-slate-400">เดิม</span>
      <span className="tabular-nums text-slate-500 line-through dark:text-slate-400">
        {from}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span
        className={cn(
          "rounded-md px-1.5 py-px text-sm font-bold tabular-nums",
          to > 0
            ? "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200"
            : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        )}
      >
        {to > 0 ? `${to} หีบ` : "ยังไม่ซื้อรอบนี้"}
      </span>
    </span>
  );
}

export function PromoStepReviewDialog({
  open,
  rows,
  qtyOf,
  onSetQty,
  onNext,
  onClose,
}: {
  open: boolean;
  /** รายการที่ติ๊กไว้ทั้งหมด — คอมโพเนนต์คัดเองว่าตัวไหนมีโปรของแถม */
  rows: StockRowComputed[];
  qtyOf: (row: StockRowComputed) => number;
  onSetQty: (skuCode: string, qty: number) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  /** คีย์ของรายการที่ร้านกดว่า "ใช้จำนวนเดิม" — ตอนกดถัดไปจะไม่แตะบรรทัดนั้น */
  const [keepOriginal, setKeepOriginal] = useState<Set<string>>(new Set());

  // เปิดใหม่ = เริ่มนับหนึ่ง (ค่าที่เลือกไว้รอบก่อนไม่ควรค้างข้ามออเดอร์)
  useEffect(() => {
    if (open) setKeepOriginal(new Set());
  }, [open]);

  const items = useMemo<ReviewItem[]>(() => {
    const singles: LineItem[] = [];
    const byGroup = new Map<string, StockRowComputed[]>();

    for (const row of rows) {
      if (!hasPromoStep(row.promoTiers)) continue;
      if (isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) {
        const key = row.promoGroup!.trim();
        byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
        continue;
      }
      const qty = qtyOf(row);
      if (qty <= 0) continue;
      singles.push({
        kind: "line",
        key: row.skuCode,
        row,
        qty,
        round: planPromoStepRound(row.promoTiers, qty),
      });
    }

    const groups: GroupItem[] = [];
    for (const [group, members] of byGroup) {
      const inOrder = members.filter((m) => qtyOf(m) > 0);
      if (inOrder.length === 0) continue;
      const tiers =
        inOrder.map((m) => m.promoTiers ?? null).find((t) => hasPromoStep(t)) ??
        null;
      groups.push({
        kind: "group",
        key: `กลุ่ม:${group}`,
        group,
        rows: inOrder,
        pool: inOrder.reduce((sum, m) => sum + qtyOf(m), 0),
        round: planPromoGroupStepRound(
          tiers,
          inOrder.map((m) => ({
            skuCode: m.skuCode,
            qty: qtyOf(m),
            suggestOrder: m.suggestOrder,
          }))
        ),
      });
    }

    // ตัวที่ต้องปรับขึ้นก่อน — เป็นสิ่งที่ต้องตัดสินใจ ที่เหลือแค่ยืนยันว่าครบแล้ว
    return [...groups, ...singles].sort(
      (a, b) => (a.round ? 0 : 1) - (b.round ? 0 : 1)
    );
  }, [rows, qtyOf]);

  const changing = items.filter((i) => i.round != null);
  const settled = items.filter((i) => i.round == null);

  function toggleKeep(key: string) {
    setKeepOriginal((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** จำนวนที่บรรทัดนี้จะออกจากหน้านี้ไป — เลขเดิมถ้าร้านกดคงไว้ */
  function finalQtyOf(row: StockRowComputed): number {
    const qty = qtyOf(row);
    for (const item of changing) {
      if (keepOriginal.has(item.key)) continue;
      if (item.kind === "line") {
        if (item.row.skuCode === row.skuCode) return item.round!.applied;
        continue;
      }
      const change = item.round!.changes.find((c) => c.skuCode === row.skuCode);
      if (change) return change.to;
    }
    return qty;
  }

  const adjustCount = changing.filter((i) => !keepOriginal.has(i.key)).length;
  /** ปรับแล้วไม่เหลืออะไรให้สั่งเลย — ต้องบอกก่อน ไม่ใช่ปล่อยไปเจอหน้าถัดไปว่าง ๆ */
  const emptyAfter =
    rows.length > 0 && rows.every((row) => finalQtyOf(row) <= 0);

  function handleNext() {
    for (const item of changing) {
      if (keepOriginal.has(item.key)) continue;
      if (item.kind === "line") {
        onSetQty(item.row.skuCode, item.round!.applied);
        continue;
      }
      for (const change of item.round!.changes) {
        onSetQty(change.skuCode, change.to);
      }
    }
    onNext();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      sheetOnMobile
      labelledBy="promo-step-review-title"
    >
      <ModalBody className="pt-4 sm:pt-5">
        <h3
          id="promo-step-review-title"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
        >
          <Gift className="h-4 w-4 shrink-0 text-violet-500" />
          ตรวจสินค้าที่มีโปรของแถม
          <span className="ml-auto shrink-0 vmi-t-xs font-semibold text-slate-500 dark:text-slate-400">
            ขั้นที่ 1 จาก 2
          </span>
        </h3>

        {changing.length > 0 ? (
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            ของแถมนับเป็นล็อต — เศษที่ไม่ครบขั้นจ่ายเต็มแต่ไม่ได้ของแถมเพิ่ม
            ระบบปรับให้ {changing.length} รายการตามด้านล่าง กด «ใช้จำนวนเดิม»
            ถ้าไม่ต้องการปรับ
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            ทุกรายการที่มีโปรของแถมลงขั้นพอดีแล้ว — กดถัดไปเพื่อตรวจจำนวนรวม
          </p>
        )}

        {changing.length > 0 && (
          <ul className="mt-3 space-y-2">
            {changing.map((item) => {
              const kept = keepOriginal.has(item.key);
              const round = item.round!;
              // แยกฟิลด์ให้เป็นรูปเดียวกันก่อน — บรรทัดเดี่ยวคิดจากจำนวนของตัวเอง
              // โปรกลุ่มคิดจากยอดรวมของสมาชิกที่อยู่ในคำสั่ง
              const view =
                item.kind === "line"
                  ? {
                      from: item.round!.requested,
                      to: item.round!.applied,
                      up: item.round!.up,
                      changes: null,
                    }
                  : {
                      from: item.round!.pool,
                      to: item.round!.target,
                      up: item.round!.up,
                      changes: item.round!.changes,
                    };
              const tiers =
                item.kind === "line"
                  ? item.row.promoTiers
                  : item.rows[0]!.promoTiers;
              // ของแถมที่จะได้จากจำนวนที่จะใช้จริง เทียบกับจำนวนเดิม
              const gift = earnedFreeGoods(tiers, kept ? view.from : view.to);
              const giftBefore = earnedFreeGoods(tiers, view.from);
              return (
                <li
                  key={item.key}
                  className={cn(
                    "rounded-xl border p-2.5",
                    kept
                      ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
                      : "border-violet-200 bg-violet-50/60 dark:border-violet-900/50 dark:bg-violet-950/20"
                  )}
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                    <div className="min-w-0 flex-1">
                      {item.kind === "line" ? (
                        <>
                          <p className="text-sm font-bold leading-snug text-teal-700 dark:text-teal-400">
                            {item.row.skuCode}
                          </p>
                          <p className="mt-0.5 line-clamp-2 break-words text-sm text-slate-800 dark:text-slate-200">
                            {item.row.skuName}
                          </p>
                          <p className="mt-0.5 vmi-t-xs text-slate-500 dark:text-slate-400">
                            {promoTierLabel(item.row, view.up)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold leading-snug text-violet-700 dark:text-violet-300">
                            โปรกลุ่ม {item.group}
                          </p>
                          <p className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200">
                            {item.rows.length} รายการในคำสั่งนี้ ·{" "}
                            {promoTierLabel(item.rows[0]!, view.up)}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <QtyChange from={view.from} to={kept ? view.from : view.to} />
                      <Button
                        size="sm"
                        variant={kept ? "secondary" : "outline"}
                        className="h-6 gap-1 px-2 vmi-t-xs"
                        onClick={() => toggleKeep(item.key)}
                      >
                        {kept ? (
                          <>
                            <Gift className="h-3 w-3" />
                            ปรับให้ได้ของแถม
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-3 w-3" />
                            ใช้จำนวนเดิม ({view.from})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <p
                    className={cn(
                      "mt-1.5 vmi-t-xs",
                      kept
                        ? "text-slate-500 dark:text-slate-400"
                        : "text-violet-800 dark:text-violet-300"
                    )}
                  >
                    {kept
                      ? "ใช้จำนวนเดิม — ส่วนที่ไม่ครบขั้นจะไม่ได้ของแถม"
                      : promoStepRoundReason(round)}
                  </p>

                  {/* คำถามจริงของร้านคือ "แล้วได้แถมกี่ชิ้น" — ตอบด้วยจำนวนที่จะได้จริง
                      ไม่ขึ้นเมื่อได้ 0 เพราะบรรทัดเหตุผลข้างบนบอกไปแล้วว่าไม่ได้ */}
                  {gift && gift.count > 0 && (
                    <p className="mt-1 flex items-center gap-1 vmi-t-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <Gift className="h-3 w-3 shrink-0" />
                      ได้ของแถม {gift.count} {gift.unit}
                      {!kept && giftBefore && (
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {giftBefore.count === gift.count
                            ? "· เท่าเดิม (เศษที่ตัดออกไม่ได้แถมอยู่แล้ว)"
                            : giftBefore.count > 0
                              ? `· เดิมได้ ${giftBefore.count} ${gift.unit}`
                              : "· เดิมไม่ได้เลย"}
                        </span>
                      )}
                    </p>
                  )}

                  {view.changes && !kept && (
                    <ul className="mt-1.5 space-y-0.5 vmi-t-xs text-slate-600 dark:text-slate-400">
                      {view.changes.map((c) => (
                        <li key={c.skuCode} className="tabular-nums">
                          <span className="font-mono font-semibold">
                            {c.skuCode}
                          </span>{" "}
                          {c.from} → {c.to} หีบ
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {settled.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/30">
            <p className="flex items-center gap-1.5 vmi-t-xs font-semibold text-slate-600 dark:text-slate-300">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ลงขั้นโปรอยู่แล้ว {settled.length} รายการ
            </p>
            <ul className="mt-1 space-y-0.5 vmi-t-xs text-slate-600 dark:text-slate-400">
              {settled.map((item) => {
                const gift =
                  item.kind === "line"
                    ? earnedFreeGoods(item.row.promoTiers, item.qty)
                    : earnedFreeGoods(item.rows[0]!.promoTiers, item.pool);
                return (
                  <li key={item.key} className="break-words">
                    {item.kind === "line" ? (
                      <>
                        <span className="font-mono font-semibold">
                          {item.row.skuCode}
                        </span>{" "}
                        {item.row.skuName} ·{" "}
                        <span className="tabular-nums">{item.qty} หีบ</span>
                      </>
                    ) : (
                      <>
                        โปรกลุ่ม {item.group} ·{" "}
                        <span className="tabular-nums">รวม {item.pool} หีบ</span>
                      </>
                    )}
                    {gift && gift.count > 0 && (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {" "}
                        · ได้ของแถม {gift.count} {gift.unit}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {emptyAfter && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ปรับแล้วจะไม่เหลือรายการที่ต้องสั่งเลย — กด «ใช้จำนวนเดิม»
            อย่างน้อยหนึ่งรายการถ้ายังต้องการสั่งรอบนี้
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button size="sm" variant="outline" onClick={onClose}>
          แก้ต่อ
        </Button>
        <Button size="sm" onClick={handleNext}>
          ถัดไป{adjustCount > 0 ? ` · ปรับ ${adjustCount} รายการ` : ""}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
