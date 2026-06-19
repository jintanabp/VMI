import {
  calcLineAmount,
  calcNetUnitPrice,
} from "@/lib/calculations";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
  resolvePromoContext,
} from "@/lib/fabric";
import {
  filterCandidateRows,
  formatPremiumUnit,
  getC4PromoForQty,
  lookupC4,
  promoRowsToTiers,
} from "@/lib/fabric/promotion-lookup";

export interface OrderPromoLineInput {
  skuCode: string;
  qty: number;
}

export interface OrderPromoLineResult {
  skuCode: string;
  qty: number;
  currentPromo?: string | null;
  nextPromo?: string | null;
  nextPromoQty?: number | null;
  qtyToNext?: number | null;
  currentKind?: string | null;
  nextKind?: string | null;
  hasPromoLadder?: boolean;
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired: boolean;
  discountBaht?: number | null;
  discountPct?: number | null;
  freeGood?: {
    premiumProduct: string;
    premiumName: string;
    qty: number;
    unit: string;
    unitLabel: string;
    tierFromQty: number;
    tierPremiumQty: number;
    pooledQty?: number;
    lineQty?: number;
  } | null;
  pooledQty?: number;
}

export function lookupOrderPromoLines(
  storeCode: string,
  lines: OrderPromoLineInput[],
  options?: { salesRepEmail?: string | null }
) {
  if (!fabricPromoReady()) {
    throw new Error("PROMO_NOT_LOADED");
  }

  const promo = getPromotionCreditDirectory();
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;
  const ctx = resolvePromoContext(storeCode, {
    salesRepEmail: options?.salesRepEmail,
  });

  const c4Lines = lines.map((l, i) => ({
    itemId: String(i),
    product: String(l.skuCode ?? ""),
    qty: Number(l.qty ?? 0),
  }));

  const lookup = lookupC4(c4Lines, {
    division: ctx.division,
    cusgroup: ctx.cusgroup,
    region: ctx.region,
    promo,
  });

  const perSku: OrderPromoLineResult[] = lines.map((l, i) => {
    const code = String(l.skuCode ?? "");
    const qty = Number(l.qty ?? 0);
    const rows = filterCandidateRows(
      promo,
      ctx.division,
      ctx.cusgroup,
      code,
      ctx.region
    );
    const tiers = promoRowsToTiers(rows);
    const lineResult = lookup.lines.find((r) => r.itemId === String(i));
    const tierQty = lineResult?.pooledQty ?? qty;
    let display = getC4PromoForQty(tierQty, tiers);

    const fg = lineResult?.freeGood;
    let freeGood: OrderPromoLineResult["freeGood"] = null;
    if (fg) {
      const premiumName =
        skuDir?.nameForSku(fg.premiumProduct) || fg.premiumProduct;
      const unitLabel = formatPremiumUnit(fg.unit);
      freeGood = {
        premiumProduct: fg.premiumProduct,
        premiumName,
        qty: fg.qty,
        unit: fg.unit,
        unitLabel,
        tierFromQty: fg.tierFromQty,
        tierPremiumQty: fg.tierPremiumQty,
        pooledQty: fg.pooledQty,
        lineQty: qty,
      };
      const hasDiscount =
        (lineResult?.discountBaht ?? 0) > 0 ||
        (lineResult?.discountPct ?? 0) > 0;
      if (!hasDiscount) {
        display = {
          ...display,
          currentPromo: `แถม ${premiumName} ×${fg.qty} ${unitLabel}`,
          currentKind: "premium" as const,
        };
      }
    }

    const priceLookup = skuDir?.getLookupPrice(code) ?? {
      price: null,
      expired: false,
    };
    const unitPrice = priceLookup.price;
    const discountBaht = lineResult?.discountBaht ?? null;
    const discountPct = lineResult?.discountPct ?? null;
    const netUnitPrice = calcNetUnitPrice(
      unitPrice,
      discountBaht,
      discountPct
    );
    const lineTotal = calcLineAmount(qty, unitPrice, netUnitPrice);

    return {
      skuCode: code,
      qty,
      ...display,
      hasPromoLadder: display.hasPromoLadder ?? tiers.length > 0,
      unitPrice,
      netUnitPrice,
      lineTotal,
      priceExpired: priceLookup.expired,
      discountBaht,
      discountPct,
      freeGood,
      pooledQty: lineResult?.pooledQty ?? qty,
    };
  });

  const orderTotal = perSku.reduce((sum, ln) => sum + (ln.lineTotal ?? 0), 0);

  return {
    context: ctx,
    lines: perSku,
    skipped: lookup.skipped,
    orderTotal: orderTotal > 0 ? orderTotal : null,
  };
}
