"use client";

import { ArrowUpRight, Gift, Percent } from "lucide-react";
import type { PromoTierKind } from "@/lib/calculations";
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
  /** มีแถวโปรใน C4 แต่ไม่มีสิทธิประโยชน์เลย */
  hasPromoLadder?: boolean;
  onApplyNext?: (qty: number) => void;
  variant?: "table" | "card" | "embedded";
}

function kindMeta(kind?: PromoTierKind | null) {
  if (kind === "premium") {
    return {
      label: "ของแถม",
      icon: Gift,
      card: "border-violet-200/80 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-950/40",
      badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
      text: "text-violet-900 dark:text-violet-200",
    };
  }
  if (kind === "discount_baht" || kind === "discount_pct") {
    return {
      label: "ส่วนลด",
      icon: Percent,
      card: "border-emerald-200/80 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/35",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
      text: "text-emerald-900 dark:text-emerald-200",
    };
  }
  return null;
}

function isPremiumPromoText(text: string | null | undefined): boolean {
  return (text?.startsWith("แถม") ?? false) || (text?.includes("ได้แถม") ?? false);
}

export function PromoDetailCell({
  currentPromo,
  currentKind,
  nextPromo,
  qtyToNext,
  nextPromoQty,
  nextKind,
  freeGood,
  hasPromoLadder,
  onApplyNext,
  variant = "table",
}: PromoDetailCellProps) {
  const showFreeGood = Boolean(freeGood && freeGood.qty > 0);
  const hasCurrent = Boolean(currentPromo);
  const hasNext =
    Boolean(nextPromo) &&
    nextPromoQty != null &&
    (qtyToNext ?? 0) > 0;

  const hideCurrentForFreeGood =
    showFreeGood &&
    (currentKind === "premium" || isPremiumPromoText(currentPromo));

  const showCurrentPromo = hasCurrent && !hideCurrentForFreeGood;

  if (!showCurrentPromo && !hasNext && !showFreeGood) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500">
        {hasPromoLadder ? "ไม่มีส่วนลด/ของแถม" : "ไม่มีโปร"}
      </span>
    );
  }

  const meta = kindMeta(currentKind);
  const gap =
    variant === "card" ? "gap-2.5" : variant === "embedded" ? "gap-1" : "gap-1.5";
  const maxW = variant === "table" ? "max-w-[280px]" : "max-w-none";
  const boxPad =
    variant === "embedded"
      ? "rounded-lg border px-2 py-1.5"
      : "rounded-xl border px-2.5 py-2";

  const pooledNote =
    freeGood &&
    freeGood.pooledQty != null &&
    freeGood.lineQty != null &&
    freeGood.pooledQty > freeGood.lineQty
      ? `รวม ${freeGood.pooledQty} หีบในกลุ่มโปรเดียวกัน`
      : null;

  return (
    <div className={cn("flex flex-col", gap, maxW)}>
      {showCurrentPromo && meta && (
        <div
          className={cn(
            "flex items-start gap-1.5",
            boxPad,
            meta.card
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md",
              variant === "embedded" ? "h-4 w-4" : "h-5 w-5",
              meta.badge
            )}
          >
            <meta.icon className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {meta.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-xs font-medium leading-snug",
                meta.text
              )}
            >
              {currentPromo}
            </p>
          </div>
        </div>
      )}

      {showFreeGood && freeGood && (
        <div
          className={cn(
            "flex items-start gap-1.5 border border-violet-200/80 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-950/40",
            boxPad
          )}
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
            <Gift className="h-3 w-3" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
              ของแถม
            </p>
            <p className="text-xs font-semibold leading-snug text-violet-900 dark:text-violet-100">
              {freeGood.premiumName}
            </p>
            {freeGood.premiumName !== freeGood.premiumProduct && (
              <p className="text-[11px] text-violet-700 dark:text-violet-300">
                รหัส {freeGood.premiumProduct}
              </p>
            )}
            <p className="text-[11px] font-medium text-violet-800 dark:text-violet-200">
              ×{freeGood.qty} {freeGood.unitLabel}
            </p>
            <p className="text-[10px] leading-snug text-violet-700/90 dark:text-violet-300/90">
              ซื้อครบ {freeGood.tierFromQty} หีบ/ขั้น แถม {freeGood.tierPremiumQty}{" "}
              ต่อขั้น
              {pooledNote ? ` · ${pooledNote}` : ""}
            </p>
          </div>
        </div>
      )}

      {hasNext && (
        <NextPromoHint
          qtyToNext={qtyToNext!}
          nextPromo={nextPromo!}
          nextPromoQty={nextPromoQty!}
          nextKind={nextKind}
          onApplyNext={onApplyNext}
        />
      )}
    </div>
  );
}

function NextPromoHint({
  qtyToNext,
  nextPromo,
  nextPromoQty,
  nextKind,
  onApplyNext,
}: {
  qtyToNext: number;
  nextPromo: string;
  nextPromoQty: number;
  nextKind?: PromoTierKind | null;
  onApplyNext?: (qty: number) => void;
}) {
  const kindLabel =
    nextKind === "premium"
      ? "ของแถม"
      : nextKind === "discount_baht" || nextKind === "discount_pct"
        ? "ส่วนลด"
        : "โปร";

  const body = (
    <>
      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
          {kindLabel} ถัดไป · สั่งอีก {qtyToNext} หีบ
        </p>
        <p className="text-[11px] leading-snug text-sky-800 dark:text-sky-300">
          {nextPromo}
        </p>
      </div>
    </>
  );

  const className = cn(
    "flex items-start gap-1.5 border border-sky-200/80 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-950/30",
    onApplyNext && "transition-colors hover:bg-sky-100 dark:hover:bg-sky-950/50",
    onApplyNext ? "rounded-lg px-2 py-1.5" : "rounded-lg px-2 py-1.5"
  );

  if (onApplyNext) {
    return (
      <button type="button" onClick={() => onApplyNext(nextPromoQty)} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
