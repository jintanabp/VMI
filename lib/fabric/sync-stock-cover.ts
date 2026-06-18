import { prisma } from "@/lib/prisma";
import { fabricStockReady, getStockCoverDirectory } from "./stock-cover";
import { getStockFilterConfig } from "./stock-filter-config";

/** Ensure SKU catalog exists from stock_cover_day (all configured sources). */
export async function syncStockCoverForStore(
  _storeId: string,
  storeCode: string
): Promise<number> {
  if (!fabricStockReady()) return 0;

  const dir = getStockCoverDirectory();
  const config = getStockFilterConfig();
  const sources = dir.resolveSources(config);
  const seen = new Set<string>();
  let count = 0;

  for (const source of sources.length > 0 ? sources : [null]) {
    const rows = dir.getForStore(storeCode, source ?? undefined);
    for (const row of rows) {
      if (seen.has(row.productCode)) continue;
      seen.add(row.productCode);

      await prisma.sku.upsert({
        where: { code: row.productCode },
        create: { code: row.productCode, name: row.productName },
        update: { name: row.productName },
      });
      count += 1;
    }
  }

  if (count > 0) {
    console.info(
      `[StockCover] Catalog sync ${count} SKUs for store ${storeCode}`
    );
  }
  return count;
}
