import {
  fabricPromoReady,
  fabricSkuMasterReady,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
  resolvePromoContext,
} from "@/lib/fabric";
import {
  formatPromoDiscount,
  formatPremiumUnit,
  normalizeRegion,
} from "@/lib/fabric/promotion-lookup";
import {
  hasPremium,
  isStepTier,
  promoActiveOn,
  promoServesRegion,
  type PromoRow,
} from "@/lib/fabric/promotion-credit";

export interface PromoInspectorTier {
  fromQty: number;
  toQty: number;
  unit: string;
  unitLabel: string;
  discBaht: number | null;
  discPct: number | null;
  premiumProduct: string;
  premiumName: string;
  premiumQty: number;
  premiumUnit: string;
  premiumUnitLabel: string;
  assortedGroup: string;
  fromDate: string;
  toDate: string;
  discountLabel: string;
  isStepTier: boolean;
}

export interface PromoInspectorProduct {
  product: string;
  name: string;
  creditPrice: number | null;
  creditPriceExpired: boolean;
  rows: PromoInspectorTier[];
}

export interface PromoInspectorResult {
  context: {
    division: string;
    cusgroup: string;
    region: string;
    date: string;
  };
  sku?: string;
  skuName?: string;
  group?: string;
  poolKey?: string;
  products: PromoInspectorProduct[];
  ladder: PromoInspectorTier[];
}

function tierFromRow(row: PromoRow, premiumName: (code: string) => string): PromoInspectorTier {
  return {
    fromQty: row.fromQty,
    toQty: row.toQty,
    unit: row.unit,
    unitLabel: formatPremiumUnit(row.unit),
    discBaht: row.discAmt > 0 ? row.discAmt : null,
    discPct: row.discPct > 0 ? row.discPct : null,
    premiumProduct: row.premiumProduct,
    premiumName: premiumName(row.premiumProduct),
    premiumQty: row.premiumQty,
    premiumUnit: row.premiumUnit,
    premiumUnitLabel: formatPremiumUnit(row.premiumUnit),
    assortedGroup: (row.raw.ASSORTEDPRODUCTGROUP ?? "").trim(),
    fromDate: (row.raw.FROMDATE ?? "").slice(0, 10),
    toDate: (row.raw.TODATE ?? "").slice(0, 10),
    discountLabel: formatPromoDiscount(row),
    isStepTier: isStepTier(row) && hasPremium(row),
  };
}

function activeRows(
  rows: PromoRow[],
  region: string,
  day: Date
): PromoRow[] {
  const normRegion = normalizeRegion(region);
  return rows.filter(
    (r) => promoActiveOn(r, day) && promoServesRegion(r, normRegion)
  );
}

function dedupeLadder(tiers: PromoInspectorTier[]): PromoInspectorTier[] {
  const seen = new Set<string>();
  const out: PromoInspectorTier[] = [];
  for (const t of tiers) {
    const key = `${t.fromQty}|${t.toQty}|${t.discountLabel}|${t.premiumProduct}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.sort((a, b) => a.fromQty - b.fromQty || a.toQty - b.toQty);
}

export function buildPromoInspector(input: {
  storeCode: string;
  sku?: string;
  group?: string;
  salesRepEmail?: string | null;
  day?: Date;
}): PromoInspectorResult {
  if (!fabricPromoReady()) {
    throw new Error("PROMO_NOT_LOADED");
  }

  const day = input.day ?? new Date();
  const promo = getPromotionCreditDirectory();
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;
  const ctx = resolvePromoContext(input.storeCode, {
    salesRepEmail: input.salesRepEmail,
  });

  const nameFor = (code: string) =>
    skuDir?.nameForSku(code) || code;

  const pricing = (code: string) => {
    const p = skuDir?.getLookupPrice(code, day) ?? {
      price: null,
      expired: false,
    };
    return { creditPrice: p.price, creditPriceExpired: p.expired };
  };

  const empty: PromoInspectorResult = {
    context: {
      division: ctx.division,
      cusgroup: ctx.cusgroup,
      region: ctx.region,
      date: day.toISOString().slice(0, 10),
    },
    products: [],
    ladder: [],
  };

  if (!ctx.division || !ctx.cusgroup) return empty;

  const group = input.group?.trim();
  const sku = input.sku?.trim();

  if (group) {
    const rows = activeRows(
      promo.rowsForGroup(ctx.division, ctx.cusgroup, group),
      ctx.region,
      day
    );
    const byProd = new Map<string, PromoRow[]>();
    for (const r of rows) {
      const bucket = byProd.get(r.product) ?? [];
      bucket.push(r);
      byProd.set(r.product, bucket);
    }
    const products: PromoInspectorProduct[] = [...byProd.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([product, rs]) => ({
        product,
        name: nameFor(product),
        ...pricing(product),
        rows: rs.map((r) => tierFromRow(r, nameFor)),
      }));
    const ladder = dedupeLadder(products.flatMap((p) => p.rows));
    return {
      ...empty,
      group,
      poolKey: group,
      products,
      ladder,
    };
  }

  if (!sku) return empty;

  const rows = activeRows(
    promo.rowsFor(ctx.division, ctx.cusgroup, sku),
    ctx.region,
    day
  );
  const assorted = promo.assortedGroupFor(ctx.division, ctx.cusgroup, sku);
  const tierRows = rows.map((r) => tierFromRow(r, nameFor));

  if (assorted) {
    return buildPromoInspector({
      ...input,
      group: assorted,
      sku: undefined,
    });
  }

  return {
    ...empty,
    sku,
    skuName: nameFor(sku),
    poolKey: rows[0]?.poolKey ?? sku,
    products: [
      {
        product: sku,
        name: nameFor(sku),
        ...pricing(sku),
        rows: tierRows,
      },
    ],
    ladder: dedupeLadder(tierRows),
  };
}
