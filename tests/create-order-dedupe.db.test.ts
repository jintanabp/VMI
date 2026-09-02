import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";
import type { OrderItemInput } from "@/lib/repositories/types";

/**
 * กันออเดอร์ซ้ำด้วย clientRequestId
 *
 * เคสจริงที่เจ็บ: ร้านกดปุ่มส่งสองที · เน็ตกระตุกแล้วเบราว์เซอร์ retry · เห็น error
 * ที่จริงแล้วสำเร็จไปแล้วเลยกดใหม่ — เดิมได้ออเดอร์ซ้ำที่เซลล์ต้องมานั่งไล่ปฏิเสธ
 * และของค้าง (pendingQty) ถูกนับซ้ำจนคำแนะนำรอบถัดไปเพี้ยน
 *
 * พิสูจน์ด้วย pure function ไม่ได้ ต้องมี unique index จริงในฐานข้อมูล —
 * โดยเฉพาะเคสสอง request ยิงพร้อมกันซึ่งผ่านด่าน "เช็คก่อนสร้าง" ไปทั้งคู่
 */

const hasPrisma = prismaCliAvailable();

function items(qty: number, skuId: string): OrderItemInput[] {
  return [
    {
      skuId,
      suggestedQty: qty,
      finalQty: qty,
      cvdEstimate: 10,
    } as OrderItemInput,
  ];
}

describe.skipIf(!hasPrisma)("createOrder — กันส่งซ้ำ", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let createOrder: typeof import("@/lib/repositories/prisma-repository").prismaOrderRepository.createOrder;
  let storeId: string;
  let skuId: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-dedupe");
    setTestDatabaseUrl(db.url);

    ({ prisma } = await import("@/lib/prisma"));
    const repo = await import("@/lib/repositories/prisma-repository");
    createOrder = repo.prismaOrderRepository.createOrder;

    const store = await prisma.store.create({
      data: { code: "vda1", name: "VDA1" },
    });
    const sku = await prisma.sku.create({
      data: { code: "111111", name: "สินค้าทดสอบ" },
    });
    storeId = store.id;
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  it("ส่งซ้ำด้วยรหัสเดิม = ได้ใบเดิม ไม่เปิดใบใหม่", async () => {
    const first = await createOrder(storeId, items(5, skuId), "req-กดสองที");
    const second = await createOrder(storeId, items(5, skuId), "req-กดสองที");

    expect(second.id).toBe(first.id);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);

    const count = await prisma.order.count({
      where: { clientRequestId: "req-กดสองที" },
    });
    expect(count).toBe(1);
  });

  it("ยิงพร้อมกัน = สำเร็จใบเดียว อีก request ได้ใบเดียวกัน", async () => {
    const both = await Promise.all([
      createOrder(storeId, items(3, skuId), "req-ชนกันพอดี"),
      createOrder(storeId, items(3, skuId), "req-ชนกันพอดี"),
    ]);

    expect(both[0].id).toBe(both[1].id);
    // ผู้ชนะมีคนเดียวเสมอ อีกคนต้องเป็น reused ไม่ใช่ error
    expect(both.filter((r) => !r.reused)).toHaveLength(1);

    const count = await prisma.order.count({
      where: { clientRequestId: "req-ชนกันพอดี" },
    });
    expect(count).toBe(1);
  });

  it("คนละรหัส = คนละใบ (สั่งรอบใหม่ต้องได้ใบใหม่)", async () => {
    const a = await createOrder(storeId, items(1, skuId), "req-รอบเช้า");
    const b = await createOrder(storeId, items(1, skuId), "req-รอบบ่าย");
    expect(a.id).not.toBe(b.id);
    expect(b.reused).toBe(false);
  });

  it("ไม่ส่งรหัสมา = สร้างใบใหม่ทุกครั้ง (client เก่ายังใช้งานได้)", async () => {
    const a = await createOrder(storeId, items(2, skuId));
    const b = await createOrder(storeId, items(2, skuId));
    expect(a.id).not.toBe(b.id);
    expect(a.reused).toBe(false);
    expect(b.reused).toBe(false);
  });
});
