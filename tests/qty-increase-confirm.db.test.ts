import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";
import type { OrderItemInput } from "@/lib/repositories/types";

/**
 * พนักงานเพิ่มจำนวนเกินที่ร้านขอ (requestedQty) ต้องรอร้านยืนยันก่อนถึงจะอนุมัติทั้งใบได้
 * ลดจำนวนไม่ต้องรอ (ตามที่ผู้ใช้ระบุ) — ดู lib/repositories/prisma-repository.ts updateOrderItemQty
 */

const hasPrisma = prismaCliAvailable();

function items(qty: number, skuId: string): OrderItemInput[] {
  return [
    { skuId, suggestedQty: qty, finalQty: qty, cvdEstimate: 10 } as OrderItemInput,
  ];
}

describe.skipIf(!hasPrisma)("updateOrderItemQty — รอร้านยืนยันเมื่อเพิ่มจำนวน", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let repo: typeof import("@/lib/repositories/prisma-repository").prismaOrderRepository;
  let storeId: string;
  let skuId: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-qty-increase");
    setTestDatabaseUrl(db.url);

    ({ prisma } = await import("@/lib/prisma"));
    const mod = await import("@/lib/repositories/prisma-repository");
    repo = mod.prismaOrderRepository;

    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    const sku = await prisma.sku.create({ data: { code: "111111", name: "สินค้าทดสอบ" } });
    storeId = store.id;
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  async function newOrderItem(qty: number) {
    const { id: orderId } = await repo.createOrder(storeId, items(qty, skuId));
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    return { orderId, itemId: order.items[0]!.id };
  }

  it("เพิ่มจำนวนเกินที่ร้านขอ → pendingConfirm = true และตั้งธงใน DB", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    const result = await repo.updateOrderItemQty(orderId, itemId, 8);
    expect(result.pendingConfirm).toBe(true);

    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.finalQty).toBe(8);
    expect(item.qtyIncreasePendingConfirm).toBe(true);
    expect(item.requestedQty).toBe(5);
  });

  it("ลดจำนวน (หรือกลับไปเท่าที่ขอ) → ไม่ต้องรอร้านยืนยัน", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    await repo.updateOrderItemQty(orderId, itemId, 8); // เพิ่มก่อน
    const result = await repo.updateOrderItemQty(orderId, itemId, 3); // แล้วลด
    expect(result.pendingConfirm).toBe(false);

    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.qtyIncreasePendingConfirm).toBe(false);
  });

  it("ออเดอร์เก่าที่ไม่มี requestedQty (null) → เพิ่มจำนวนไม่ต้องรอ เพราะไม่รู้เส้นฐาน", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    await prisma.orderItem.update({ where: { id: itemId }, data: { requestedQty: null } });

    const result = await repo.updateOrderItemQty(orderId, itemId, 20);
    expect(result.pendingConfirm).toBe(false);
  });

  it("confirmQtyIncrease — ปลดล็อกโดยไม่แตะ finalQty/requestedQty", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    await repo.updateOrderItemQty(orderId, itemId, 9);

    await repo.confirmQtyIncrease(orderId, itemId);

    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.qtyIncreasePendingConfirm).toBe(false);
    expect(item.finalQty).toBe(9);
    expect(item.requestedQty).toBe(5);
  });

  it("rejectQtyIncrease — คืน finalQty กลับไปเท่าที่ร้านขอไว้ตอนแรก", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    await repo.updateOrderItemQty(orderId, itemId, 12);

    await repo.rejectQtyIncrease(orderId, itemId);

    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.qtyIncreasePendingConfirm).toBe(false);
    expect(item.finalQty).toBe(5);
  });

  it("confirmQtyIncrease บนรายการที่ไม่ได้ pending อยู่ → โยน ORDER_ITEM_NOT_FOUND", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    await expect(repo.confirmQtyIncrease(orderId, itemId)).rejects.toThrow(
      "ORDER_ITEM_NOT_FOUND"
    );
  });

  it("การอนุมัติออเดอร์ต้องถูกกันไว้ขณะมีรายการรอยืนยัน (เช็คระดับ route ผ่าน count ตรง ๆ)", async () => {
    const { orderId, itemId } = await newOrderItem(5);
    await repo.updateOrderItemQty(orderId, itemId, 7);

    const pendingCount = await prisma.orderItem.count({
      where: { orderId, qtyIncreasePendingConfirm: true },
    });
    expect(pendingCount).toBe(1);

    await repo.confirmQtyIncrease(orderId, itemId);
    const pendingAfter = await prisma.orderItem.count({
      where: { orderId, qtyIncreasePendingConfirm: true },
    });
    expect(pendingAfter).toBe(0);
  });
});
