import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** ลบข้อมูล demo เก่า — ระบบใช้ Fabric/VDA จริง */
async function main() {
  const pendingOrders = await prisma.order.findMany({
    where: { status: "pending_approval" },
    select: { id: true },
  });
  if (pendingOrders.length > 0) {
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: pendingOrders.map((o) => o.id) } },
    });
    await prisma.order.deleteMany({
      where: { status: "pending_approval" },
    });
    console.log(`Removed ${pendingOrders.length} pending order(s)`);
  }

  const dummyStores = await prisma.store.findMany({
    where: { code: { startsWith: "ST" } },
    select: { id: true },
  });
  const dummyIds = dummyStores.map((s) => s.id);

  if (dummyIds.length > 0) {
    await prisma.orderItem.deleteMany({
      where: { order: { storeId: { in: dummyIds } } },
    });
    await prisma.order.deleteMany({ where: { storeId: { in: dummyIds } } });
    await prisma.stockItem.deleteMany({ where: { storeId: { in: dummyIds } } });
    await prisma.store.deleteMany({ where: { id: { in: dummyIds } } });
    console.log(`Removed ${dummyIds.length} dummy store(s) and related orders/stock`);
  }

  const orphanSkuCodes = await prisma.sku.findMany({
    where: { code: { startsWith: "SKU-" } },
    select: { id: true },
  });
  if (orphanSkuCodes.length > 0) {
    const ids = orphanSkuCodes.map((s) => s.id);
    await prisma.promoTier.deleteMany({ where: { skuId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { skuId: { in: ids } } });
    await prisma.stockItem.deleteMany({ where: { skuId: { in: ids } } });
    await prisma.sku.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removed ${ids.length} dummy SKU(s)`);
  }

  console.log("Seed complete — no dummy data inserted (use Fabric sync + VDA login).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
