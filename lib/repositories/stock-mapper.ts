import {
  calcLineAmount,
  calcMaxStock,
  calcMinStock,
  calcNetUnitPrice,
  calcStockCvd,
  calcSuggestOrder,
  getPromoForQty,
  piecesToCases,
  type PromoResult,
  type PromoTierInput,
} from "@/lib/calculations";
import { activePromoRowAtQty } from "@/lib/fabric/promotion-lookup";
import type { PromoRow } from "@/lib/fabric/promotion-credit";
import { bangkokDateStr, isoDateStr, daysBetweenIso } from "@/lib/fabric/bkk-date";
import type { StockRowComputed } from "./types";

export function mapStockRow(
  storeId: string,
  item: {
    skuId: string;
    /** คงเหลือหน่วยชิ้น (qty_available ดิบ) */
    stock: number;
    /** ยอดขายเฉลี่ยหน่วยชิ้น/วัน */
    avgSales: number;
    avgQtyOutL7?: number;
    /** ชิ้นต่อหีบ — ไม่ระบุ = 1 (ถือว่าข้อมูลเป็นหีบอยู่แล้ว) */
    packSize?: number;
    noSales30?: boolean;
    minDays: number;
    maxDays: number;
    thresholdSource?: "sku" | "section" | "default";
    fromDb?: string;
    unitPrice?: number | null;
    /** มูลค่าสต็อกจริงจาก product.product (รวมมาแล้ว — ห้ามคูณ stock ซ้ำ) */
    stockValue?: number | null;
    priceExpired?: boolean;
    c4PromoRows?: PromoRow[];
    promoGroup?: string | null;
    promoGroupMembers?: number;
    barcode?: string;
    section?: string;
    brand?: string;
    sku: {
      code: string;
      name: string;
      promoTiers: PromoTierInput[];
    };
    promoOverride?: PromoResult;
    /** จำนวนแนะนำที่ผู้เรียกคิดมาแล้ว (เช่น ปัดตามขั้นโปรของแถม) — ใช้แทนสูตร MIN/MAX */
    suggestOverride?: number;
    poolQtyForDiscount?: number;
    isNew?: boolean;
    fromTarget?: boolean;
    blocked?: boolean;
    blockReason?: string | null;
    blockEffectiveFrom?: string | null;
    blockEffectiveTo?: string | null;
  }
): StockRowComputed {
  // แปลง ชิ้น → หีบ ที่นี่จุดเดียว แล้วปลายน้ำเป็นหีบล้วน
  // (ราคาเงินสดจาก SKU master และ promo tier C4 นับเป็นหีบ ส่วน stock_cover_day นับเป็นชิ้น)
  const packSize = item.packSize && item.packSize > 0 ? item.packSize : 1;
  const stockPieces = item.stock;
  const { cases: stockCases, remainder: stockRemainder } = piecesToCases(
    stockPieces,
    packSize
  );
  const stock = stockPieces / packSize;
  const avgSales = item.avgSales / packSize;
  const avgQtyOutL7 = (item.avgQtyOutL7 ?? item.avgSales) / packSize;

  const minStock = calcMinStock(avgSales, item.minDays);
  const maxStock = calcMaxStock(avgSales, item.maxDays);
  // ถ้าอยู่ใน blocklist (ถึงกำหนดแล้ว) ไม่ต้องแนะนำสั่ง
  // calcSuggestOrder ปัด Math.ceil อยู่แล้ว — พอเป็นหน่วยหีบจึงได้ "ปัดขึ้นเป็นหีบเต็ม"
  const suggestOrder = item.blocked
    ? 0
    : (item.suggestOverride ??
      calcSuggestOrder(stock, avgSales, item.minDays, item.maxDays));

  let discountBaht: number | null = null;
  let discountPct: number | null = null;
  const tierQty =
    item.poolQtyForDiscount ??
    (suggestOrder > 0 ? suggestOrder : 0);

  if (item.c4PromoRows?.length && tierQty > 0) {
    const active = activePromoRowAtQty(item.c4PromoRows, tierQty);
    if (active) {
      discountBaht = active.discAmt > 0 ? active.discAmt : null;
      discountPct =
        !discountBaht && active.discPct > 0 ? active.discPct : null;
    }
  }

  const netUnitPrice = calcNetUnitPrice(
    item.unitPrice,
    discountBaht,
    discountPct
  );
  const lineTotal =
    suggestOrder > 0
      ? calcLineAmount(suggestOrder, item.unitPrice, netUnitPrice)
      : null;

  // ส่ง tierQty ตรง ๆ (ยอม 0) — เดิมแกล้งสมมติว่าสั่ง 1 หีบเมื่อยังไม่มีจำนวน
  // ทำให้แถวที่ยังไม่ได้สั่งโชว์ "ได้โปรแล้ว" ทั้งที่ยังไม่ได้อะไร
  // ที่ qty 0 จะได้ currentPromo = null และ nextPromo/qtyToNext บอกเงื่อนไขขั้นแรกแทน
  const promo =
    item.promoOverride ?? getPromoForQty(tierQty, item.sku.promoTiers);

  /**
   * ตัวเลขที่เป็น "เงิน" ผูกกับจำนวนที่สั่งจริง — ไม่มีจำนวนก็ยังไม่มีส่วนลด
   *
   * เดิมใช้ suggestOrder > 0 เป็นเกตของทุกอย่างรวมถึงข้อมูลโปรด้วย ผลคือสินค้าที่
   * สต็อกยังพอ (ระบบไม่แนะนำให้สั่ง) จะไม่แสดงโปรเลยทั้งที่มีโปร active อยู่จริง
   * เช่น 426544 กลุ่ม BSWN บน vda4 — คนดูเห็นโปรใน C4 แต่หน้าจอว่าง
   */
  const showMoney = tierQty > 0;

  // จำนวนวันที่โปร active จะหมด (นับวันที่ใกล้สุดในบรรดา c4PromoRows ที่ active อยู่)
  let currentPromoEndsInDays: number | null = null;
  if (item.c4PromoRows?.length) {
    const today = bangkokDateStr(new Date());
    for (const r of item.c4PromoRows) {
      if (!r.toDate) continue;
      const d = daysBetweenIso(today, isoDateStr(r.toDate));
      if (d >= 0 && (currentPromoEndsInDays === null || d < currentPromoEndsInDays)) {
        currentPromoEndsInDays = d;
      }
    }
  }

  return {
    storeId,
    skuId: item.skuId,
    skuCode: item.sku.code,
    skuName: item.sku.name,
    barcode: item.barcode ?? "",
    section: item.section ?? "",
    brand: item.brand ?? "",
    packSize,
    stockPieces,
    stockCases,
    stockRemainder,
    stock,
    avgSales,
    avgQtyOutL7,
    noSales30: item.noSales30 ?? false,
    minDays: item.minDays,
    maxDays: item.maxDays,
    thresholdSource: item.thresholdSource ?? "default",
    minStock,
    maxStock,
    stockCvd: calcStockCvd(stock, avgSales),
    suggestOrder,
    // ข้อมูลโปรไม่มีเกต — โปรที่ active อยู่ต้องเห็นทุกแถว ไม่ว่าจะควรสั่งหรือไม่
    currentPromo: promo.currentPromo,
    nextPromo: promo.nextPromo,
    nextPromoQty: promo.nextPromoQty,
    qtyToNext: promo.qtyToNext,
    currentPromoKind: promo.currentKind ?? null,
    nextPromoKind: promo.nextKind ?? null,
    hasPromoLadder: promo.hasPromoLadder ?? false,
    currentPromoEndsInDays,
    promoGroup: item.promoGroup ?? null,
    promoGroupMembers: item.promoGroupMembers ?? 0,
    promoTiers: item.sku.promoTiers,
    unitPrice: item.unitPrice ?? null,
    stockValue: item.stockValue ?? null,
    discountBahtPerCase: showMoney ? discountBaht : null,
    discountPctPerCase: showMoney ? discountPct : null,
    netUnitPrice: showMoney ? netUnitPrice : item.unitPrice ?? null,
    lineTotal: showMoney ? lineTotal : null,
    priceExpired: item.priceExpired ?? false,
    needsOrder: suggestOrder > 0,
    fromDb: item.fromDb,
    isNew: item.isNew ?? false,
    fromTarget: item.fromTarget ?? false,
    blocked: item.blocked ?? false,
    blockReason: item.blockReason ?? null,
    blockEffectiveFrom: item.blockEffectiveFrom ?? null,
    blockEffectiveTo: item.blockEffectiveTo ?? null,
    freeGood: null,
  };
}
