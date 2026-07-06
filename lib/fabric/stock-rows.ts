import { prisma } from "@/lib/prisma";
import { mapStockRow } from "@/lib/repositories/stock-mapper";
import type { StockRowComputed } from "@/lib/repositories/types";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
} from "./index";
import { resolvePromoContext } from "./promotion-context";
import {
  filterCandidateRows,
  promoRowsToTiers,
} from "./promotion-lookup";
import {
  countPromoGroupMembers,
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
  const config = getStockFilterConfig();
  const dir = getStockCoverDirectory();
  const sources = dir.resolveSources(config);
  const activeFromDb = resolveActiveFromDb(sources, requestedFromDb, config);

  if (!activeFromDb) {
    return { sources: [], activeFromDb: null, filterMode: config.filterMode, rows: [] };
  }

  const coverRows = dir.getForStore(storeCode, activeFromDb);
  const promoCtx = resolvePromoContext(storeCode);
  const promoDir = fabricPromoReady() ? getPromotionCreditDirectory() : null;
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;

  const skus = await ensureSkus(coverRows);
  const skuByCode = new Map(skus.map((s) => [s.code, s]));

  const stockItems = await prisma.stockItem.findMany({
    where: { storeId, skuId: { in: skus.map((s) => s.id) } },
  });
  const stockBySkuId = new Map(stockItems.map((si) => [si.skuId, si]));

  const rows: StockRowComputed[] = [];

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

    const minDays = stockItem?.minDays ?? 7;
    const maxDays = stockItem?.maxDays ?? 15;

    rows.push(
      mapStockRow(storeId, {
        skuId: sku.id,
        stock: cover.qtyAvailable,
        avgSales,
        minDays,
        maxDays,
        fromDb: cover.fromDb,
        unitPrice: priceLookup?.price ?? null,
        priceExpired: priceLookup?.expired ?? false,
        c4PromoRows,
        promoGroup,
        promoGroupMembers,
        sku: {
          code: sku.code,
          name: skuName,
          promoTiers,
        },
      })
    );
  }

  return {
    sources,
    activeFromDb,
    filterMode: config.filterMode,
    rows,
  };
}
