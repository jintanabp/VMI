import { prisma } from "@/lib/prisma";
import { mapStockRow } from "@/lib/repositories/stock-mapper";
import type { StockRowComputed } from "@/lib/repositories/types";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  ensureFabricMastersFresh,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
} from "./index";
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

function resolveAvgSales(row: {
  avgQtyOutL7: number | null;
  avgQtyOutL30: number | null;
}): number {
  const avg = row.avgQtyOutL7 ?? row.avgQtyOutL30;
  if (avg != null && avg > 0) return avg;
  return 1;
}

async function ensureSkus(
  coverRows: { productCode: string; productName: string }[]
) {
  const codes = [...new Set(coverRows.map((c) => c.productCode))];
  if (codes.length === 0) return [];

  const existing = await prisma.sku.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  const byCode = new Map(existing.map((s) => [s.code, s]));

  const toCreate = codes
    .filter((code) => !byCode.has(code))
    .map((code) => {
      const cover = coverRows.find((r) => r.productCode === code)!;
      return { code, name: cover.productName };
    });

  if (toCreate.length > 0) {
    await prisma.sku.createMany({ data: toCreate });
  }

  const namesToUpdate = codes
    .map((code) => {
      const cover = coverRows.find((r) => r.productCode === code)!;
      const sku = byCode.get(code);
      if (sku && sku.name !== cover.productName) {
        return { id: sku.id, name: cover.productName };
      }
      return null;
    })
    .filter((x): x is { id: string; name: string } => x != null);

  if (namesToUpdate.length > 0) {
    await Promise.all(
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

export async function buildFabricStockPayload(
  storeId: string,
  storeCode: string,
  requestedFromDb?: string | null
): Promise<StockApiPayload> {
  ensureFabricMastersFresh();
  const config = getStockFilterConfig();
  const dir = getStockCoverDirectory();
  const sources = dir.resolveSources(config);
  const activeFromDb = resolveActiveFromDb(sources, requestedFromDb, config);

  if (!activeFromDb) {
    return {
      sources: [],
      activeFromDb: null,
      filterMode: config.filterMode,
      dataDate: null,
      rows: [],
    };
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

  const rows: StockRowComputed[] = [];
  const pending: {
    cover: (typeof coverRows)[number];
    sku: (typeof skus)[number];
    stockItem: (typeof stockItems)[number] | undefined;
    avgSales: number;
    minDays: number;
    maxDays: number;
    promoTiers: ReturnType<typeof promoRowsToTiers>;
    c4PromoRows: ReturnType<typeof filterCandidateRows> | undefined;
    promoGroup: string | null;
    promoGroupMembers: number;
    skuName: string;
    section: string;
    meta: ReturnType<NonNullable<typeof skuDir>["metaForSku"]>;
    priceLookup: ReturnType<NonNullable<typeof skuDir>["getLookupPrice"]> | undefined;
    suggestOrder: number;
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
        promoTiers = promoRowsToTiers(c4PromoRows);
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

    // ลำดับความสำคัญ: override รายตัว (StockItem) → กลุ่ม (Section) → default
    const groupThreshold = section
      ? thresholdBySection.get(section)
      : undefined;
    const minDays = stockItem?.minDays ?? groupThreshold?.minDays ?? 7;
    const maxDays = stockItem?.maxDays ?? groupThreshold?.maxDays ?? 15;
    const suggestOrder = calcSuggestOrder(
      cover.qtyAvailable,
      avgSales,
      minDays,
      maxDays
    );

    pending.push({
      cover,
      sku,
      stockItem,
      avgSales,
      minDays,
      maxDays,
      promoTiers,
      c4PromoRows,
      promoGroup,
      promoGroupMembers,
      skuName,
      section,
      meta,
      priceLookup,
      suggestOrder,
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
        minDays: item.minDays,
        maxDays: item.maxDays,
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
        sku: {
          code: item.sku.code,
          name: item.skuName,
          promoTiers: item.promoTiers,
        },
      })
    );
  }

  return {
    sources,
    activeFromDb,
    filterMode: config.filterMode,
    dataDate,
    rows,
  };
}
