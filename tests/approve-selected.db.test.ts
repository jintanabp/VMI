import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  seedPendingOrder,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * อนุมัติเฉพาะบางรายการ (A1b) — ที่ไม่ได้เลือกแยกเป็นออเดอร์ใหม่รออนุมัติ
 *
 * ต้องมี DB จริง: ย้ายแถวข้ามออเดอร์ + ออกเลข PO + รวมกลับเมื่ออนุมัติล้ม
 */

const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("approveSelectedItems — อนุมัติบางรายการ", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let mod: typeof import("@/lib/po/approve-selected");

  beforeAll(async () => {
    db = createTestDatabase("vmi-approve-selected");
    setTestDatabaseUrl(db.url);
    // เอกสาร PO เขียนลง <cwd>/logs/po-export — ย้าย cwd ไป temp กันไฟล์ปนของจริง
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "vmi-po-sel-")));
    mod = await import("@/lib/po/approve-selected");
    ({ prisma } = await import("@/lib/prisma"));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.order.deleteMany();
    await prisma.store.deleteMany();
    await prisma.sku.deleteMany();
    await prisma.poSequence.deleteMany();
  });

  it("ออก PO เฉพาะที่เลือก ที่เหลือย้ายไปออเดอร์ใหม่รออนุมัติ (แถวเดิม ไม่ได้ก็อป)", async () => {
    const { orderId, itemIds, storeId } = await seedPendingOrder(prisma, {
      qtys: [10, 20, 30],
    });
    await prisma.orderItem.update({
      where: { id: itemIds[2]! },
      data: { requestedQty: 30, finalQty: 40, qtyIncreasePendingConfirm: true },
    });

    const res = await mod.approveSelectedItems(orderId, "a@x.com", [itemIds[0]!, itemIds[1]!], {});

    expect(res.purchaseOrders).toHaveLength(1);
    expect(res.purchaseOrders[0]!.itemCount).toBe(2);
    expect(res.remainderCount).toBe(1);

    const original = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(original.status).toBe("approved");
    expect(original.items.map((i) => i.id).sort()).toEqual([itemIds[0], itemIds[1]].sort());

    const rest = await prisma.order.findUniqueOrThrow({
      where: { id: res.remainderOrderId! },
      include: { items: true },
    });
    expect(rest.status).toBe("pending_approval");
    expect(rest.storeId).toBe(storeId);
    expect(rest.createdAt.getTime()).toBe(original.createdAt.getTime());
    // แถวเดิมย้ายมาทั้งแถว — สถานะรอร้านยืนยันติดมาด้วย ร้านตอบต่อในใบใหม่ได้
    expect(rest.items).toHaveLength(1);
    expect(rest.items[0]!.id).toBe(itemIds[2]);
    expect(rest.items[0]!.qtyIncreasePendingConfirm).toBe(true);
    expect(rest.items[0]!.requestedQty).toBe(30);
  });

  it("เลือกครึ่งกลุ่มโปรที่รวมยอด → ปฏิเสธ ไม่แตะออเดอร์เลย", async () => {
    const { orderId, itemIds } = await seedPendingOrder(prisma, { qtys: [5, 5, 5] });
    await prisma.orderItem.updateMany({
      where: { id: { in: [itemIds[0]!, itemIds[1]!] } },
      data: { c4PromoGroup: "G1", c4PromoGroupMembers: 2 },
    });

    await expect(
      mod.approveSelectedItems(orderId, "a@x.com", [itemIds[0]!, itemIds[2]!], {})
    ).rejects.toBeInstanceOf(mod.PartialSelectionError);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(order.status).toBe("pending_approval");
    expect(order.items).toHaveLength(3);
    expect(await prisma.order.count()).toBe(1);
  });

  it("เลือกทั้งกลุ่มโปร → ผ่าน", async () => {
    const { orderId, itemIds } = await seedPendingOrder(prisma, { qtys: [5, 5, 5] });
    await prisma.orderItem.updateMany({
      where: { id: { in: [itemIds[0]!, itemIds[1]!] } },
      data: { c4PromoGroup: "G1", c4PromoGroupMembers: 2 },
    });

    const res = await mod.approveSelectedItems(orderId, "a@x.com", [itemIds[0]!, itemIds[1]!], {});
    expect(res.remainderCount).toBe(1);
  });

  it("เลือกครบทุกรายการ = อนุมัติทั้งใบ ไม่สร้างใบใหม่", async () => {
    const { orderId, itemIds } = await seedPendingOrder(prisma, { qtys: [1, 2] });
    const res = await mod.approveSelectedItems(orderId, "a@x.com", itemIds, {});
    expect(res.remainderOrderId).toBeNull();
    expect(await prisma.order.count()).toBe(1);
  });

  it("อนุมัติล้มหลังแยกแล้ว → รวมกลับเป็นใบเดิม ไม่มีใบใหม่ค้าง", async () => {
    const { orderId, itemIds } = await seedPendingOrder(prisma, { qtys: [1, 2, 3] });
    // จัดกลุ่ม PO ให้แค่บรรทัดเดียวในสองที่เลือก → validatePoSplit "ยังไม่ได้จัดกลุ่ม" ล้ม
    await prisma.orderItem.update({ where: { id: itemIds[0]! }, data: { poGroup: "A" } });

    await expect(
      mod.approveSelectedItems(orderId, "a@x.com", [itemIds[0]!, itemIds[1]!], {})
    ).rejects.toThrow("SPLIT_INVALID");

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(order.status).toBe("pending_approval");
    expect(order.items).toHaveLength(3);
    expect(await prisma.order.count()).toBe(1);
  });

  it("รายการที่ไม่อยู่ในออเดอร์ → ปฏิเสธ", async () => {
    const { orderId } = await seedPendingOrder(prisma, { qtys: [1, 2] });
    await expect(
      mod.approveSelectedItems(orderId, "a@x.com", ["nope"], {})
    ).rejects.toBeInstanceOf(mod.PartialSelectionError);
  });
});
