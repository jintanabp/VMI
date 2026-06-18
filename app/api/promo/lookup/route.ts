import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  lookupC4,
  promoRowsToTiers,
  getC4PromoForQty,
} from "@/lib/fabric/promotion-lookup";
import { CUSTOMER_STORE_CODE_COOKIE } from "@/lib/auth/roles";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value;
  if (!storeCode) {
    return NextResponse.json({ error: "ไม่พบ session" }, { status: 401 });
  }

  if (!fabricPromoReady()) {
    return NextResponse.json({ error: "Promotion master not loaded" }, { status: 503 });
  }

  const body = await request.json();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const promo = getPromotionCreditDirectory();
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;
  const ctx = resolvePromoContext(storeCode);

  const c4Lines = lines.map(
    (l: { skuCode?: string; qty?: number }, i: number) => ({
      itemId: String(i),
      product: String(l.skuCode ?? ""),
      qty: Number(l.qty ?? 0),
    })
  );

  const lookup = lookupC4(c4Lines, {
    division: ctx.division,
    cusgroup: ctx.cusgroup,
    region: ctx.region,
    promo,
  });

  const perSku = lines.map(
    (l: { skuCode?: string; qty?: number }, i: number) => {
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
      let freeGood = null;
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
        display = {
          ...display,
          currentPromo: `แถม ${premiumName} ×${fg.qty} ${unitLabel}`,
          currentKind: "premium" as const,
        };
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
        tiers,
        ...display,
        unitPrice,
        netUnitPrice,
        lineTotal,
        priceExpired: priceLookup.expired,
        discountBaht,
        discountPct,
        freeGood,
        pooledQty: lineResult?.pooledQty ?? qty,
      };
    }
  );

  const orderTotal = (perSku as Array<{ lineTotal: number | null }>).reduce(
    (sum, ln) => sum + (ln.lineTotal ?? 0),
    0
  );

  return NextResponse.json({
    context: ctx,
    lines: perSku,
    skipped: lookup.skipped,
    orderTotal: orderTotal > 0 ? orderTotal : null,
  });
}
