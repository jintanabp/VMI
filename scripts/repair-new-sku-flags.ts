/**
 * One-shot: เคลียร์ป้าย "สินค้าใหม่" ที่ติดผิดจาก bulk sync
 * Usage: npx tsx --env-file=.env scripts/repair-new-sku-flags.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  backdatedSkuCreatedAt,
  getNewProductDays,
  repairAnomalousNewSkus,
  resetRepairAnomalousNewSkusGuard,
} from "../lib/fabric/sku-created-at";

const prisma = new PrismaClient();

async function main() {
  const days = getNewProductDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const total = await prisma.sku.count();
  const newCount = await prisma.sku.count({
    where: { createdAt: { gte: cutoff } },
  });

  console.log(`Sku total=${total}, marked new (<${days}d)=${newCount}`);

  const force = process.argv.includes("--force");
  if (force) {
    const stamped = backdatedSkuCreatedAt(days);
    const result = await prisma.sku.updateMany({
      where: { createdAt: { gte: cutoff } },
      data: { createdAt: stamped },
    });
    console.log(`Force backdated ${result.count} SKUs → ${stamped.toISOString()}`);
    return;
  }

  resetRepairAnomalousNewSkusGuard();
  const repaired = await repairAnomalousNewSkus();
  if (repaired === 0) {
    console.log(
      "No anomalous bulk-new state (≥50%). Use --force to backdate all currently-new SKUs."
    );
  } else {
    console.log(`Repaired ${repaired} SKUs.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
