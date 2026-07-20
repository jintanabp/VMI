import { prisma } from "@/lib/prisma";
import { mapStockRow } from "@/lib/repositories/stock-mapper";
import type { StockRowComputed } from "@/lib/repositories/types";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  ensureFabricMastersFresh,
  fabricMastersMtimeSignature,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
} from "./index";
import { storeDataVersion } from "./data-version";
import { resolvePromoContext } from "./promotion-context";
import {
  filterCandidateRows,
  promoRowsToTiers,
} from "./promotion-lookup";
import { calcSuggestOrder } from "@/lib/calculations";
import {
  countPromoGroupMembers,
  isPooledPromoGroup,
} from "@/lib/promo/promo-group-display";
import {
  getStockFilterConfig,
  resolveActiveFromDb,
  type StockFilterConfig,
} from "./stock-filter-config";
import { fabricStockReady, getStockCoverDirectory } from "./stock-cover";

// สินค้าถือว่า "ใหม่" ถ้า Sku.createdAt อยู่ภายในกี่วันล่าสุด (default 30)
const NEW_PRODUCT_DAYS = Math.max(
  0,
  Number(process.env.NEW_PRODUCT_DAYS ?? 30) || 30
);

const DEFAULT_MIN_DAYS = 7;
const DEFAULT_MAX_DAYS = 15;

/** StockItem ใน DB มี default 7/15 เสมอ — ถือว่าเป็น "ยังไม่แก้รายตัว" ให้สืบทอดค่าแบรนด์ */
function isSkuThresholdOverride(
  stockItem: { minDays: number; maxDays: number } | undefined
): boolean {
  if (!stockItem) return false;
  return (
    stockItem.minDays !== DEFAULT_MIN_DAYS ||
    stockItem.maxDays !== DEFAULT_MAX_DAYS
  );
}

function resolveThresholdDays(
  stockItem: { minDays: number; maxDays: number } | undefined,
  groupThreshold: { minDays: number; maxDays: number } | undefined
): {
  minDays: number;
  maxDays: number;
  thresholdSource: "sku" | "section" | "default";
} {
  if (isSkuThresholdOverride(stockItem)) {
    return {
      minDays: stockItem!.minDays,
      maxDays: stockItem!.maxDays,
      thresholdSource: "sku",
    };
  }
  if (groupThreshold) {
    return {
      minDays: groupThreshold.minDays,
      maxDays: groupThreshold.maxDays,
      thresholdSource: "section",
    };
  }
  return {
    minDays: DEFAULT_MIN_DAYS,
    maxDays: DEFAULT_MAX_DAYS,
    thresholdSource: "default",
  };
}

// ค่าที่ใช้คำนวณ CVD / แนะนำสั่ง: L7 ถ้าว่าง "หรือเป็น 0" ให้ใช้ L30
// (ค่า 0 = ช่วง 7 วันล่าสุดเงียบ — ไม่ควรบล็อกดีมานด์จาก 30 วัน ไม่งั้นจะไม่แนะนำสั่งเลย)
function resolveAvgSales(row: {
  avgQtyOutL7: number | null;
  avgQtyOutL30: number | null;
}): number {
  const l7 = row.avgQtyOutL7;
  if (l7 != null && l7 > 0) return l7;
  return row.avgQtyOutL30 ?? l7 ?? 0;
}

async function ensureSkus(
  coverRows: { productCode: string; productName: string }[]
) {
  // index ชื่อสินค้าตาม productCode ครั้งเดียว (เลิก coverRows.find ใน loop = O(n²))
  const nameByCode = new Map<string, string>();
  for (const r of coverRows) {
    if (!nameByCode.has(r.productCode)) nameByCode.set(r.productCode, r.productName);
  }
  const codes = [...nameByCode.keys()];
  if (codes.length === 0) return [];

  const existing = await prisma.sku.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  const byCode = new Map(existing.map((s) => [s.code, s]));

  const toCreate = codes
    .filter((code) => !byCode.has(code))
    .map((code) => ({ code, name: nameByCode.get(code)! }));

  if (toCreate.length > 0) {
    // ตาราง Sku ว่างมาก่อน = bulk import ครั้งแรก → ไม่มีประวัติว่าตัวไหน "ใหม่จริง"
    // backdate createdAt ให้พ้นหน้าต่าง NEW_PRODUCT_DAYS กัน "ทุกสินค้าขึ้นป้ายใหม่พร้อมกัน"
    // (ครั้งถัดไปที่มี code ใหม่จริงในแคตตาล็อกที่ตั้งไว้แล้ว จะได้ createdAt = ตอนนี้ตามปกติ)
    const isInitialSeed = (await prisma.sku.count()) === 0;
    const data = isInitialSeed
      ? toCreate.map((s) => ({
          ...s,
          createdAt: new Date(Date.now() - (NEW_PRODUCT_DAYS + 1) * 86_400_000),
        }))
      : toCreate;
    await prisma.sku.createMany({ data });
  }

  // ชื่อที่เปลี่ยน — เทียบจาก Map (O(n)) เฉพาะ sku ที่มีอยู่แล้ว
  const namesToUpdate: { id: string; name: string }[] = [];
  for (const [code, sku] of byCode) {
    const name = nameByCode.get(code);
    if (name != null && sku.name !== name) {
      namesToUpdate.push({ id: sku.id, name });
    }
  }

  if (namesToUpdate.length > 0) {
    // batch เป็น transaction เดียว (แทน Promise.all ของ update อิสระ N ตัว — ลด round-trip + กัน SQLite lock)
    await prisma.$transaction(
      namesToUpdate.map((u) =>
        prisma.sku.update({ where: { id: u.id }, data: { name: u.name } })
      )
    );
  }

  return prisma.sku.findMany({
    where: { code: { in: codes } },
    include: { promoTiers: { orderBy: { sortOrder: "asc" } } },
  });
}

export interface StockApiPayload {
  sources: string[];
  activeFromDb: string | null;
  filterMode: StockFilterConfig["filterMode"] | null;
  /** วันที่ข้อมูลล่าสุด (ISO) จาก stock_cover_day */
  dataDate: string | null;
  rows: StockRowComputed[];
}

export function listStockFromDbSources(config = getStockFilterConfig()): string[] {
  if (!fabricStockReady()) return [];
  return getStockCoverDirectory().resolveSources(config);
}

// Cache ผลลัพธ์ payload ต่อ (store, fromDb) — payload เปลี่ยนเฉพาะเมื่อไฟล์ master เปลี่ยน
// หรือมีการแก้ threshold เท่านั้น จึงไม่ต้อง recompute + query DB ทุก request
const payloadCache = new Map<string, StockApiPayload>();
let payloadCacheMtime = "";

export async function buildFabricStockPayload(
  storeId: string,
  storeCode: string,
  requestedFromDb?: string | null
): Promise<StockApiPayload> {
  ensureFabricMastersFresh();

  // ล้าง cache ทั้งชุดเฉพาะเมื่อไฟล์ master เปลี่ยน (sync ใหม่) — ข้อมูลใหม่ทั้งกระดาน
  const mtimeSig = fabricMastersMtimeSignature();
  if (mtimeSig !== payloadCacheMtime) {
    payloadCache.clear();
    payloadCacheMtime = mtimeSig;
  }

  // cacheKey ผูกกับ version ของร้านนั้น — แก้ threshold/blocklist ของร้านหนึ่ง
  // จะ bust cache เฉพาะร้านนั้น (ไม่กระทบ cache ร้านอื่น)
  const prefix = `${storeId}|${storeCode}|${requestedFromDb ?? ""}|`;
  const cacheKey = `${prefix}v${storeDataVersion(storeId)}`;
  const cached = payloadCache.get(cacheKey);
  if (cached) return cached;
  // ลบ entry เวอร์ชันเก่าของ (store, fromDb) เดียวกัน กัน cache โตจากการแก้ threshold ซ้ำ ๆ
  for (const k of payloadCache.keys()) {
    if (k.startsWith(prefix) && k !== cacheKey) payloadCache.delete(k);
  }

  const config = getStockFilterConfig();
  const dir = getStockCoverDirectory();
  const sources = dir.resolveSources(config);
  const activeFromDb = resolveActiveFromDb(sources, requestedFromDb, config);

  if (!activeFromDb) {
    const emptyPayload: StockApiPayload = {
      sources: [],
      activeFromDb: null,
      filterMode: config.filterMode,
      dataDate: null,
      rows: [],
    };
    payloadCache.set(cacheKey, emptyPayload);
    return emptyPayload;
  }

  // ของแถม: productcode ขึ้นต้นด้วย 0 — ไม่แสดงในหน้าสั่งซื้อของร้านค้า
  const allCoverRows = dir.getForStore(storeCode, activeFromDb);
  const coverRows = allCoverRows.filter((c) => !c.productCode.startsWith("0"));
  const maxDateMs = allCoverRows.reduce(
    (max, c) => (c.dateMs > max ? c.dateMs : max),
    0
  );
  const dataDate = maxDateMs > 0 ? new Date(maxDateMs).toISOString() : null;
  const promoCtx = resolvePromoContext(storeCode);
  const promoDir = fabricPromoReady() ? getPromotionCreditDirectory() : null;
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;

  const skus = await ensureSkus(coverRows);
  const skuByCode = new Map(skus.map((s) => [s.code, s]));

  const stockItems = await prisma.stockItem.findMany({
    where: { storeId, skuId: { in: skus.map((s) => s.id) } },
  });
  const stockBySkuId = new Map(stockItems.map((si) => [si.skuId, si]));

  // ค่า min/max ระดับกลุ่ม (Section) ต่อร้าน — ใช้เป็น default ก่อน override รายตัว
  const groupThresholds = await prisma.storeGroupThreshold.findMany({
    where: { storeId },
  });
  const thresholdBySection = new Map(
    groupThresholds.map((g) => [g.section, g])
  );

  // blocklist ต่อร้าน — ระงับ suggest เมื่อถึงกำหนดหยุดสั่ง
  const blocks = await prisma.storeSkuBlock.findMany({ where: { storeId } });
  const blockBySkuId = new Map(blocks.map((b) => [b.skuId, b]));
  const now = new Date();
  const newCutoffMs = now.getTime() - NEW_PRODUCT_DAYS * 86_400_000;

  const rows: StockRowComputed[] = [];
  const pending: {
    cover: (typeof coverRows)[number];
    sku: (typeof skus)[number];
    stockItem: (typeof stockItems)[number] | undefined;
    avgSales: number;
    minDays: number;
    maxDays: number;
    thresholdSource: "sku" | "section" | "default";
    promoTiers: ReturnType<typeof promoRowsToTiers>;
    c4PromoRows: ReturnType<typeof filterCandidateRows> | undefined;
    promoGroup: string | null;
    promoGroupMembers: number;
    skuName: string;
    section: string;
    meta: ReturnType<NonNullable<typeof skuDir>["metaForSku"]>;
    priceLookup: ReturnType<NonNullable<typeof skuDir>["getLookupPrice"]> | undefined;
    suggestOrder: number;
    isNew: boolean;
    blocked: boolean;
    block: (typeof blocks)[number] | undefined;
  }[] = [];

  for (const cover of coverRows) {
    const sku = skuByCode.get(cover.productCode);
    if (!sku) continue;

    const stockItem = stockBySkuId.get(sku.id);
    const avgSales = resolveAvgSales(cover);

    let promoTiers = sku.promoTiers.map((t) => ({
      minQty: t.minQty,
      discount: t.discount,
      sortOrder: t.sortOrder,
    }));
    let c4PromoRows: ReturnType<typeof filterCandidateRows> | undefined;
    let promoGroup: string | null = null;
    let promoGroupMembers = 0;

    if (promoDir) {
      c4PromoRows = filterCandidateRows(
        promoDir,
        promoCtx.division,
        promoCtx.cusgroup,
        cover.productCode,
        promoCtx.region
      );
      if (c4PromoRows.length > 0) {
        promoTiers = promoRowsToTiers(c4PromoRows).map((t) => {
          if (!t.premiumProduct) return t;
          return {
            ...t,
            premiumName:
              skuDir?.nameForSku(t.premiumProduct) || t.premiumProduct,
          };
        });
        const group = promoDir.assortedGroupFor(
          promoCtx.division,
          promoCtx.cusgroup,
          cover.productCode
        );
        if (group) {
          promoGroupMembers = countPromoGroupMembers(
            promoDir.rowsForGroup(
              promoCtx.division,
              promoCtx.cusgroup,
              group
            )
          );
          if (promoGroupMembers > 1) promoGroup = group;
        }
      }
    }

    const priceLookup = skuDir?.getLookupPrice(cover.productCode);
    const skuName =
      skuDir?.nameForSku(cover.productCode) || sku.name || cover.productName;
    const meta = skuDir?.metaForSku(cover.productCode) ?? null;
    const section = meta?.section ?? "";

    // ลำดับ: แก้รายตัว (ไม่ใช่ค่า default 7/15) → แบรนด์ (Section) → default
    const groupThreshold = section
      ? thresholdBySection.get(section)
      : undefined;
    const { minDays, maxDays, thresholdSource } = resolveThresholdDays(
      stockItem,
      groupThreshold
    );

    // blocklist: ถ้าถึงกำหนดหยุดสั่งแล้ว ไม่ต้องแนะนำ (แต่ถ้า effectiveFrom เป็นอนาคต ยังแนะนำปกติ)
    const block = blockBySkuId.get(sku.id);
    const blocked = block != null && block.effectiveFrom <= now;
    const isNew = sku.createdAt != null && sku.createdAt.getTime() >= newCutoffMs;

    const suggestOrder = blocked
      ? 0
      : calcSuggestOrder(cover.qtyAvailable, avgSales, minDays, maxDays);

    pending.push({
      cover,
      sku,
      stockItem,
      avgSales,
      minDays,
      maxDays,
      thresholdSource,
      promoTiers,
      c4PromoRows,
      promoGroup,
      promoGroupMembers,
      skuName,
      section,
      meta,
      priceLookup,
      suggestOrder,
      isNew,
      blocked,
      block,
    });
  }

  const groupPools = new Map<string, number>();
  for (const item of pending) {
    if (!isPooledPromoGroup(item.promoGroup, item.promoGroupMembers)) continue;
    if (item.suggestOrder <= 0) continue;
    const key = item.promoGroup!.trim();
    groupPools.set(key, (groupPools.get(key) ?? 0) + item.suggestOrder);
  }

  for (const item of pending) {
    const poolQty =
      item.promoGroup && item.suggestOrder > 0
        ? groupPools.get(item.promoGroup.trim())
        : undefined;

    rows.push(
      mapStockRow(storeId, {
        skuId: item.sku.id,
        stock: item.cover.qtyAvailable,
        avgSales: item.avgSales,
        avgQtyOutL7: item.cover.avgQtyOutL7 ?? 0,
        noSales30:
          !((item.cover.avgQtyOutL7 ?? 0) > 0) &&
          !((item.cover.avgQtyOutL30 ?? 0) > 0),
        minDays: item.minDays,
        maxDays: item.maxDays,
        thresholdSource: item.thresholdSource,
        fromDb: item.cover.fromDb,
        unitPrice: item.priceLookup?.price ?? null,
        priceExpired: item.priceLookup?.expired ?? false,
        c4PromoRows: item.c4PromoRows,
        promoGroup: item.promoGroup,
        promoGroupMembers: item.promoGroupMembers,
        barcode: item.meta?.barcode ?? "",
        section: item.section,
        brand: item.meta?.brand ?? "",
        poolQtyForDiscount: poolQty,
        isNew: item.isNew,
        blocked: item.blocked,
        blockReason: item.block?.reason ?? null,
        blockEffectiveFrom: item.block?.effectiveFrom?.toISOString() ?? null,
        sku: {
          code: item.sku.code,
          name: item.skuName,
          promoTiers: item.promoTiers,
        },
      })
    );
  }

  const payload: StockApiPayload = {
    sources,
    activeFromDb,
    filterMode: config.filterMode,
    dataDate,
    rows,
  };
  payloadCache.set(cacheKey, payload);
  return payload;
}
