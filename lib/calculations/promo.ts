export type PromoTierKind =
  | "discount_baht"
  | "discount_pct"
  | "premium"
  | "other";

export interface PromoTierInput {
  minQty: number;
  discount: string;
  sortOrder: number;
  kind?: PromoTierKind;
  premiumProduct?: string;
  premiumQty?: number;
}

export interface PromoResult {
  currentPromo: string | null;
  nextPromo: string | null;
  nextPromoQty: number | null;
  qtyToNext: number | null;
  currentKind?: PromoTierKind | null;
  nextKind?: PromoTierKind | null;
}

export function formatPromoTierLabel(tier: PromoTierInput): string {
  const kind = tier.kind ?? "other";
  if (kind === "premium" && tier.premiumProduct) {
    const perStep = tier.premiumQty ? ` ×${tier.premiumQty}` : "";
    return `ซื้อครบ ${tier.minQty} หีบ/ขั้น แถม ${tier.premiumProduct}${perStep}`;
  }
  if (kind === "discount_baht" || kind === "discount_pct") {
    return `ซื้อ ${tier.minQty}+ หีบ ลด ${tier.discount}`;
  }
  return `ซื้อ ${tier.minQty}+ หีบ — ${tier.discount}`;
}

export function formatPremiumEarnedLabel(
  tier: PromoTierInput,
  pooledQty: number,
  premiumName?: string
): string {
  const label = premiumName || tier.premiumProduct || "ของแถม";
  const earned = calcStepPremiumQty(
    pooledQty,
    tier.minQty,
    tier.premiumQty ?? 0
  );
  if (earned <= 0) return formatPromoTierLabel(tier);
  return `แถม ${label} ×${earned}`;
}

export function calcStepPremiumQty(
  pooledQty: number,
  tierFromQty: number,
  tierPremiumQty: number
): number {
  if (tierFromQty <= 0 || tierPremiumQty <= 0 || pooledQty <= 0) return 0;
  return Math.floor(pooledQty / tierFromQty) * tierPremiumQty;
}

export function getPromoForQty(
  qty: number,
  tiers: PromoTierInput[]
): PromoResult {
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);

  let currentPromo: string | null = null;
  let currentKind: PromoTierKind | null = null;
  let currentTierIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    if (qty >= sorted[i].minQty) {
      const tier = sorted[i];
      currentPromo =
        tier.kind === "premium"
          ? formatPremiumEarnedLabel(tier, qty)
          : formatPromoTierLabel(tier);
      currentKind = tier.kind ?? "other";
      currentTierIndex = i;
    }
  }

  const nextTier =
    currentTierIndex < sorted.length - 1
      ? sorted[currentTierIndex + 1]
      : sorted.find((t) => qty < t.minQty) ?? null;

  if (!nextTier) {
    return {
      currentPromo,
      nextPromo: null,
      nextPromoQty: null,
      qtyToNext: null,
      currentKind,
      nextKind: null,
    };
  }

  return {
    currentPromo,
    nextPromo: formatPromoTierLabel(nextTier),
    nextPromoQty: nextTier.minQty,
    qtyToNext: Math.max(0, nextTier.minQty - qty),
    currentKind,
    nextKind: nextTier.kind ?? "other",
  };
}

/** ราคาสุทธิต่อหีบหลังส่วนลด C4 */
export function calcNetUnitPrice(
  unitPrice: number | null | undefined,
  discountBaht: number | null | undefined,
  discountPct: number | null | undefined
): number | null {
  if (unitPrice == null || unitPrice <= 0) return null;
  if (discountBaht != null && discountBaht > 0) {
    return Math.max(0, unitPrice - discountBaht);
  }
  if (discountPct != null && discountPct > 0) {
    return Math.max(0, unitPrice * (1 - discountPct / 100));
  }
  return unitPrice;
}

export function calcLineAmount(
  qty: number,
  unitPrice: number | null | undefined,
  netUnitPrice: number | null | undefined
): number | null {
  const price = netUnitPrice ?? unitPrice;
  if (price == null || price <= 0) return null;
  return price * qty;
}
