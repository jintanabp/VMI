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

  const isFlat = variant === "table" || variant === "embedded" || variant === "compact";
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

  const currentAccent =
    currentKind === "premium"
      ? "text-violet-800 dark:text-violet-300"
      : currentKind === "discount_baht" || currentKind === "discount_pct"
        ? "text-emerald-800 dark:text-emerald-400"
        : "text-slate-800 dark:text-slate-300";

  const content = (
    <div className={cn("min-w-0 space-y-0.5", isFlat && "space-y-0.5")}>
      {showCurrentPromo && (
        <p className={cn(textSize, "font-medium", currentAccent)} title={currentPromo!}>
          {currentPromo}
        </p>
      )}
      {showFreeGood && freeGood && (
        <p className={cn(textSize, "text-violet-800 dark:text-violet-300")} title={freeGood.premiumName}>
          แถม {freeGood.premiumName} ×{freeGood.qty}
        </p>
      )}
      {hasNext && (
        <NextPromoHint
          qtyToNext={qtyToNext!}
          nextPromo={nextPromo!}
          nextPromoQty={nextPromoQty!}
          onApplyNext={onApplyNext}
          flat={isFlat}
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
        "flex items-start gap-1",
        variant === "table" && "max-w-[220px]"
      )}
    >
      <div className="min-w-0 flex-1">{content}</div>
      {inspectorBtn}
    </div>
  );
}

function NextPromoHint({
  qtyToNext,
  nextPromo,
  nextPromoQty,
  onApplyNext,
  flat,
  textSize,
}: {
  qtyToNext: number;
  nextPromo: string;
  nextPromoQty: number;
  onApplyNext?: (qty: number) => void;
  flat?: boolean;
  textSize: string;
}) {
  const label = `อีก ${qtyToNext} หีบ ${nextPromo}`;

  if (onApplyNext) {
    return (
      <button
        type="button"
        onClick={() => onApplyNext(nextPromoQty)}
        className={cn(
          textSize,
          "text-left font-medium text-sky-800 underline-offset-2 hover:underline dark:text-sky-400",
          !flat && "rounded-md border border-sky-200/60 bg-sky-50/50 px-2 py-1 dark:border-sky-800/40 dark:bg-sky-950/20"
        )}
        title={label}
      >
        {label}
      </button>
    );
  }

  return (
    <p className={cn(textSize, "text-slate-600 dark:text-slate-400")} title={label}>
      {label}
    </p>
  );
}
