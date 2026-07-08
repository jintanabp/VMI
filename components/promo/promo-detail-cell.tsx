"use client";

import type { PromoTierKind } from "@/lib/calculations";
import { PromoInspectorTrigger } from "@/components/promo/c4-promo-modal";
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
  hasPromoLadder?: boolean;
  onApplyNext?: (qty: number) => void;
  variant?: "table" | "card" | "embedded" | "compact";
  inspector?: {
    skuCode: string;
    storeCode: string;
    stagedQty?: Record<string, number>;
    promoGroup?: string | null;
    promoGroupMembers?: number;
    onConfirmStaged?: (staged: Record<string, number>) => void;
  };
}

export function PromoDetailCell({
  currentPromo,
  currentKind,
  nextPromo,
  qtyToNext,
  nextPromoQty,
  freeGood,
  hasPromoLadder,
  onApplyNext,
  variant = "table",
  inspector,
}: PromoDetailCellProps) {
  const showFreeGood = Boolean(freeGood && freeGood.qty > 0);
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

  const stagedForSku = inspector?.stagedQty?.[inspector.skuCode] ?? 0;
  const showInspector = Boolean(
    inspector &&
      isPooledPromoGroup(inspector.promoGroup, inspector.promoGroupMembers) &&
      stagedForSku > 0
  );

  const inspectorBtn = showInspector ? (
    <PromoInspectorTrigger
      skuCode={inspector!.skuCode}
      storeCode={inspector!.storeCode}
      stagedQty={inspector!.stagedQty}
      onConfirmStaged={inspector!.onConfirmStaged}
    />
  ) : null;

  const textSize =
    variant === "compact" ? "text-[10px]" : "text-xs leading-snug";

  if (!showCurrentPromo && !hasNext && !showFreeGood) {
    if (variant === "compact") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          {hasPromoLadder ? "—" : "-"}
          {inspectorBtn}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <span className={cn(textSize, "text-slate-400")}>
          {hasPromoLadder ? "ไม่มีส่วนลด" : "—"}
        </span>
        {inspectorBtn}
      </div>
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

  const content = (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1")}>
      {showCurrentPromo && (
        <span className={cn(chipBase, currentChip)} title={currentPromo!}>
          <span className="truncate">{currentPromo}</span>
        </span>
      )}
      {showFreeGood && freeGood && (
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
    </div>
  );

  if (variant === "card") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-slate-700/60 dark:bg-slate-800/40">
        <div className="min-w-0 flex-1">{content}</div>
        {inspectorBtn}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-0.5",
        variant === "table" && "max-w-[220px]",
        variant === "compact" && "max-w-full"
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden">{content}</div>
      {inspectorBtn}
    </div>
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
        "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600/40"
      )}
      title={label}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
