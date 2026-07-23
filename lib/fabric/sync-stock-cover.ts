import { prisma } from "@/lib/prisma";
import { fabricStockReady, getStockCoverDirectory } from "./stock-cover";
import { getStockFilterConfig } from "./stock-filter-config";
import {
  backdatedSkuCreatedAt,
  shouldBackdateSkuCreates,
} from "./sku-created-at";

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
  const pending: { code: string; name: string }[] = [];

  for (const source of sources.length > 0 ? sources : [null]) {
    const rows = dir.getForStore(storeCode, source ?? undefined);
    for (const row of rows) {
      if (seen.has(row.productCode)) continue;
      seen.add(row.productCode);
      pending.push({ code: row.productCode, name: row.productName });
    }
  }

  if (pending.length === 0) return 0;

  const codes = pending.map((p) => p.code);
  const existing = await prisma.sku.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const have = new Set(existing.map((s) => s.code));
  const toCreate = pending.filter((p) => !have.has(p.code));
  const toUpdate = pending.filter((p) => have.has(p.code));

  if (toCreate.length > 0) {
    const existingTotal = await prisma.sku.count();
    const stamped = shouldBackdateSkuCreates(existingTotal, toCreate.length)
      ? backdatedSkuCreatedAt()
      : undefined;
    await prisma.sku.createMany({
      data: toCreate.map((s) =>
        stamped
          ? { code: s.code, name: s.name, createdAt: stamped }
          : { code: s.code, name: s.name }
      ),
    });
  }

  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((s) =>
        prisma.sku.update({
          where: { code: s.code },
          data: { name: s.name },
        })
      )
    );
  }

  const count = pending.length;
  if (count > 0) {
    console.info(
      `[StockCover] Catalog sync ${count} SKUs for store ${storeCode}` +
        (toCreate.length ? ` (+${toCreate.length} new)` : "")
    );
  }
  return count;
}
