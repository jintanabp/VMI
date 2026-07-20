export type PromoTierKind =
  | "discount_baht"
  | "discount_pct"
  | "premium"
  | "none";

export interface PromoTierInput {
  minQty: number;
  discount: string;
  sortOrder: number;
  kind?: PromoTierKind;
  premiumProduct?: string;
  /** ชื่อสินค้าของแถมจาก SKU master (ถ้ามี) */
  premiumName?: string;
  premiumQty?: number;
  /** หน่วยของแถมจาก C4 (P/B) */
  premiumUnit?: string;
  discBaht?: number;
  discPct?: number;
}

export interface PromoResult {
  currentPromo: string | null;
  nextPromo: string | null;
  nextPromoQty: number | null;
  qtyToNext: number | null;
  currentKind?: PromoTierKind | null;
  nextKind?: PromoTierKind | null;
  /** มีแถวใน C4 แต่ทุก tier ไม่มีสิทธิประโยชน์ */
  hasPromoLadder?: boolean;
}

/** tier ที่ให้ส่วนลดหรือของแถมจริง */
export function isBenefitTier(tier: PromoTierInput): boolean {
  const kind = tier.kind ?? "none";
  return (
    kind === "discount_baht" ||
    kind === "discount_pct" ||
    kind === "premium"
  );
}

export function formatPromoTierLabel(tier: PromoTierInput): string {
  return formatPromoBenefitShort(tier);
}

/** ข้อความโปรที่ได้อยู่แล้ว (กระชับ) */
export function formatPromoBenefitShort(tier: PromoTierInput): string {
  const kind = tier.kind ?? "none";
  if (kind === "premium" && tier.premiumProduct) {
    const label = tier.premiumName || tier.premiumProduct;
    const perStep = tier.premiumQty ? ` ×${tier.premiumQty}` : "";
    return `แถม ${label}${perStep}`;
  }
  if (kind === "discount_baht" || kind === "discount_pct") {
    return `ลด ${tier.discount}`;
  }
  return tier.discount || "";
}

/** ข้อความโปรขั้นถัดไป (ใช้กับ «อีก X หีบ …») */
export function formatNextPromoHint(tier: PromoTierInput): string {
  const kind = tier.kind ?? "none";
  if (kind === "premium" && tier.premiumProduct) {
    const label = tier.premiumName || tier.premiumProduct;
    const perStep = tier.premiumQty ? ` ×${tier.premiumQty}` : "";
    return `ได้แถม ${label}${perStep}`;
  }
  if (kind === "discount_baht" || kind === "discount_pct") {
    return `ได้ส่วนลด ${tier.discount}`;
  }
  return formatPromoBenefitShort(tier);
}

export function formatPromoTierLabelVerbose(tier: PromoTierInput): string {
  const kind = tier.kind ?? "none";
  if (kind === "premium" && tier.premiumProduct) {
    const label = tier.premiumName || tier.premiumProduct;
    const perStep = tier.premiumQty ? ` ×${tier.premiumQty}` : "";
    return `ซื้อครบ ${tier.minQty} หีบ/ขั้น แถม ${label}${perStep}`;
  }
  if (kind === "discount_baht" || kind === "discount_pct") {
    return `ซื้อ ${tier.minQty}+ หีบ ลด ${tier.discount}`;
  }
  return "";
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
  if (earned <= 0) return formatPromoBenefitShort(tier);
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

/** แปลงหน่วยของแถมจาก C4 (P/B) เป็นข้อความไทย — ใช้ "หีบ" ให้สอดคล้องทั้งแอป */
export function formatPremiumUnit(unit: string): string {
  const raw = (unit || "").trim();
  const u = raw.toUpperCase();
  if (u === "P") return "ชิ้น";
  if (u === "B" || raw === "ลัง") return "หีบ";
  if (raw === "หีบ") return "หีบ";
  return raw || "หีบ";
}

export function getPromoForQty(
  qty: number,
  tiers: PromoTierInput[]
): PromoResult {
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  const hasPromoLadder = sorted.length > 0;
  const benefitTiers = sorted.filter(isBenefitTier);

  if (benefitTiers.length === 0) {
    return {
      currentPromo: null,
      nextPromo: null,
      nextPromoQty: null,
      qtyToNext: null,
      currentKind: null,
      nextKind: null,
      hasPromoLadder,
    };
  }

  let currentTier: PromoTierInput | null = null;
  for (const tier of benefitTiers) {
    if (qty >= tier.minQty) currentTier = tier;
  }

  const nextTier = benefitTiers.find((t) => t.minQty > qty) ?? null;

  let currentPromo: string | null = null;
  let currentKind: PromoTierKind | null = null;
  if (currentTier) {
    currentPromo =
      currentTier.kind === "premium"
        ? formatPremiumEarnedLabel(currentTier, qty, currentTier.premiumName)
        : formatPromoBenefitShort(currentTier);
    currentKind = currentTier.kind ?? null;
  }

  return {
    currentPromo: currentPromo || null,
    nextPromo: nextTier ? formatNextPromoHint(nextTier) : null,
    nextPromoQty: nextTier?.minQty ?? null,
    qtyToNext: nextTier ? Math.max(0, nextTier.minQty - qty) : null,
    currentKind,
    nextKind: nextTier?.kind ?? null,
    hasPromoLadder,
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
