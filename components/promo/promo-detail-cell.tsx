"use client";

import { useState } from "react";
import type { PromoTierKind } from "@/lib/calculations";
import { C4PromoModal } from "@/components/promo/c4-promo-modal";
import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import { cn } from "@/lib/utils";

export interface PromoFreeGoodDetail {
  premiumProduct: string;
  premiumName: string;
  qty: number;
  unitLabel: string;
  tierFromQty: number;
  tierPremiumQty: number;
  pooledQty?: number;
  lineQty?: number;
}

interface PromoDetailCellProps {
  currentPromo?: string | null;
  currentKind?: PromoTierKind | null;
  nextPromo?: string | null;
  qtyToNext?: number | null;
  nextPromoQty?: number | null;
  nextKind?: PromoTierKind | null;
  freeGood?: PromoFreeGoodDetail | null;
  /** false = ใช้ freeGood ซ่อนชิปแถมซ้ำ แต่ไม่เรนเดอร์ชิป (มีแถวย่อยแทน) — default true */
  showFreeGoodChip?: boolean;
  hasPromoLadder?: boolean;
  /** จำนวนวันที่โปรปัจจุบันจะหมด — โชว์ป้ายเตือนเมื่อ ≤ 7 วัน */
  endsInDays?: number | null;
  onApplyNext?: (qty: number) => void;
  variant?: "table" | "card" | "embedded" | "compact";
  inspector?: {
    skuCode: string;
    storeCode: string;
    stagedQty?: Record<string, number>;
    promoGroup?: string | null;
    promoGroupMembers?: number;
    onConfirmStaged?: (staged: Record<string, number>) => void;
    /** map รหัสสินค้า -> จำนวนแนะนำสั่ง เพื่อ mark "แนะนำซื้อ" ใน modal กลุ่ม */
    suggestByProduct?: Record<string, number>;
    readOnly?: boolean;
  };
}

export function PromoDetailCell({
  currentPromo,
  currentKind,
  nextPromo,
  qtyToNext,
  nextPromoQty,
  freeGood,
  showFreeGoodChip = true,
  hasPromoLadder,
  endsInDays,
  onApplyNext,
  variant = "table",
  inspector,
}: PromoDetailCellProps) {
  const [skuModalOpen, setSkuModalOpen] = useState(false);

  const showFreeGood = Boolean(freeGood && freeGood.qty > 0);
  const renderFreeGoodChip = showFreeGood && showFreeGoodChip;
  const hasCurrent = Boolean(currentPromo);
  const hasNext =
    Boolean(nextPromo) &&
    nextPromoQty != null &&
    (qtyToNext ?? 0) > 0;

  const hideCurrentForFreeGood =
    showFreeGood &&
    (currentKind === "premium" ||
      (currentPromo?.startsWith("แถม") ?? false) ||
      (currentPromo?.includes("ได้แถม") ?? false));

  const showCurrentPromo = hasCurrent && !hideCurrentForFreeGood;

  // ได้โปรสูงสุดแล้ว: มีโปรปัจจุบัน + มีบันได แต่ไม่มีขั้นถัดไป
  const atMaxPromo =
    hasPromoLadder === true &&
    (hasCurrent || showFreeGood) &&
    !hasNext &&
    qtyToNext == null;

  const isPooled = isPooledPromoGroup(
    inspector?.promoGroup,
    inspector?.promoGroupMembers
  );
  const canOpenInspector = Boolean(inspector && !isPooled);
  const canClickPromoChip = canOpenInspector && showCurrentPromo;

  const openInspector = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSkuModalOpen(true);
  };

  const textSize =
    variant === "compact" ? "text-[10px]" : "text-xs leading-snug";

  if (!showCurrentPromo && !hasNext && !showFreeGood) {
    if (canOpenInspector) {
      return (
        <>
          <button
            type="button"
            title="กดดูรายละเอียดโปร"
            onClick={openInspector}
            className={cn(
              "inline-flex items-center gap-0.5 font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400",
              textSize
            )}
          >
            ดูโปร
          </button>
          {skuModalOpen && inspector ? (
            <C4PromoModal
              skuCode={inspector.skuCode}
              storeCode={inspector.storeCode}
              stagedQty={inspector.stagedQty ?? {}}
              onConfirm={
                inspector.readOnly ? undefined : inspector.onConfirmStaged
              }
              suggestByProduct={inspector.suggestByProduct}
              readOnly={inspector.readOnly}
              onClose={() => setSkuModalOpen(false)}
            />
          ) : null}
        </>
      );
    }
    return (
      <span className={cn(textSize, "text-slate-400")}>
        {hasPromoLadder ? (variant === "compact" ? "—" : "ไม่มีส่วนลด") : "—"}
      </span>
    );
  }

  // ชิปโปรปัจจุบัน — พื้นหลังชัดเพื่ออ่านง่ายในโหมดสว่าง
  const currentChip =
    currentKind === "premium"
      ? "bg-violet-100 text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/25"
      : currentKind === "discount_baht" || currentKind === "discount_pct"
        ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/25"
        : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:ring-slate-600/40";

  const chipBase = cn(
    "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold",
    variant === "compact" ? "text-[10px]" : "text-[11px] leading-tight"
  );

  const currentPromoChip = showCurrentPromo ? (
    canClickPromoChip ? (
      <button
        type="button"
        title="กดดูรายละเอียดโปร"
        onClick={openInspector}
        className={cn(
          chipBase,
          currentChip,
          "cursor-pointer transition-shadow hover:ring-2"
        )}
      >
        <span className="truncate">{currentPromo}</span>
      </button>
    ) : (
      <span className={cn(chipBase, currentChip)} title={currentPromo!}>
        <span className="truncate">{currentPromo}</span>
      </span>
    )
  ) : null;

  const content = (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1")}>
      {currentPromoChip}
      {renderFreeGoodChip && freeGood && (
        <span
          className={cn(
            chipBase,
            "bg-violet-100 text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/25"
          )}
          title={freeGood.premiumName}
        >
          <span className="truncate">แถม {freeGood.premiumName} ×{freeGood.qty}</span>
        </span>
      )}
      {(showCurrentPromo || showFreeGood) &&
        endsInDays != null &&
        endsInDays <= 7 && (
          <span
            className={cn(
              chipBase,
              "bg-orange-100 text-orange-800 ring-1 ring-orange-300 dark:bg-orange-500/20 dark:text-orange-200 dark:ring-orange-500/30"
            )}
            title="โปรใกล้หมด — สั่งก่อนหมดเขต"
          >
            ⏰ {endsInDays <= 0 ? "หมดวันนี้" : `หมดใน ${endsInDays} วัน`}
          </span>
        )}
      {atMaxPromo && (
        <span
          className={cn(
            chipBase,
            "bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/30"
          )}
          title="สินค้านี้ได้ส่วนลด/ของแถมขั้นสูงสุดแล้ว"
        >
          ★ สูงสุด
        </span>
      )}
      {hasNext && (
        <NextPromoHint
          qtyToNext={qtyToNext!}
          nextPromo={nextPromo!}
          nextPromoQty={nextPromoQty!}
          onApplyNext={onApplyNext}
          textSize={textSize}
        />
      )}
      {canOpenInspector && !showCurrentPromo && (hasNext || showFreeGood) && (
        <button
          type="button"
          title="กดดูรายละเอียดโปร"
          onClick={openInspector}
          className={cn(
            "inline-flex shrink-0 items-center font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400",
            textSize
          )}
        >
          ดูโปร
        </button>
      )}
    </div>
  );

  const skuModal =
    skuModalOpen && inspector ? (
      <C4PromoModal
        skuCode={inspector.skuCode}
        storeCode={inspector.storeCode}
        stagedQty={inspector.stagedQty ?? {}}
        onConfirm={inspector.readOnly ? undefined : inspector.onConfirmStaged}
        suggestByProduct={inspector.suggestByProduct}
        readOnly={inspector.readOnly}
        onClose={() => setSkuModalOpen(false)}
      />
    ) : null;

  if (variant === "card") {
    return (
      <>
        <div className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-slate-700/60 dark:bg-slate-800/40">
          <div className="min-w-0 flex-1">{content}</div>
        </div>
        {skuModal}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 items-start gap-0.5",
          variant === "table" && "max-w-[220px]",
          variant === "compact" && "max-w-full"
        )}
      >
        <div className="min-w-0 flex-1 overflow-hidden">{content}</div>
      </div>
      {skuModal}
    </>
  );
}

function NextPromoHint({
  qtyToNext,
  nextPromo,
  nextPromoQty,
  onApplyNext,
  textSize,
}: {
  qtyToNext: number;
  nextPromo: string;
  nextPromoQty: number;
  onApplyNext?: (qty: number) => void;
  textSize: string;
}) {
  const label = `อีก ${qtyToNext} หีบ ${nextPromo}`;
  const chip = cn(
    "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
    textSize
  );

  if (onApplyNext) {
    return (
      <button
        type="button"
        onClick={() => onApplyNext(nextPromoQty)}
        className={cn(
          chip,
          "bg-sky-100 text-sky-800 ring-1 ring-sky-200 transition-colors hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/25 dark:hover:bg-sky-500/25"
        )}
        title={label}
      >
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <span
      className={cn(
        chip,
        "bg-sky-50 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/25"
      )}
      title={`มีโปรถัดไป — ยืนยันสั่งตามจำนวนนี้จะได้โปรปัจจุบัน · ${label}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
