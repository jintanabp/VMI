import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * ประทับผลการส่งเข้า ERP — กันสองคนกดส่งใบเดียวกันพร้อมกัน
 *
 * ทำไมต้องทดสอบกับฐานข้อมูลจริง: สิ่งที่ต้องพิสูจน์คือ **มีคนเดียวที่ประทับสำเร็จ**
 * ซึ่งเป็นผลของ `updateMany` ที่มีเงื่อนไข `erpSentAt: null` อยู่ใน WHERE — ทดสอบด้วย
 * ฟังก์ชันบริสุทธิ์ไม่ได้ เพราะจุดตายอยู่ที่ว่าใครชนะเมื่อสอง statement ชนกัน
 *
 * เคสที่แพงถ้าพลาด: สองคนกด "ส่ง" พร้อมกัน ทั้งคู่คิดว่าตัวเองเป็นคนส่ง แล้วใบเดียวกัน
 * ถูกยิงสองครั้ง ⇒ ครั้งที่สองโดนกฎ duplicate ⇒ เลข PO นั้นเผาทิ้ง 6 เดือน
 */

const hasPrisma = prismaCliAvailable();
const PO = "V126082801A";

describe.skipIf(!hasPrisma)("ประทับผลการส่ง ERP", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let stampErpSuccess: typeof import("@/lib/po/erp-delivery").stampErpSuccess;
  let stampErpFailure: typeof import("@/lib/po/erp-delivery").stampErpFailure;
  let orderId: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-erp-stamp");
    setTestDatabaseUrl(db.url);

    ({ prisma } = await import("@/lib/prisma"));
    ({ stampErpSuccess, stampErpFailure } = await import("@/lib/po/erp-delivery"));

    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    const order = await prisma.order.create({ data: { storeId: store.id } });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  async function freshPo(poNumber: string) {
    await prisma.purchaseOrder.deleteMany({ where: { poNumber } });
    return prisma.purchaseOrder.create({
      data: {
        orderId,
        poNumber,
        groupKey: poNumber.slice(-1),
        priceKind: "c4",
        itemCount: 1,
        totalQty: 5,
        totalAmount: 5250,
      },
    });
  }

  it("ใบที่ยังไม่ส่ง ประทับได้ และเก็บ insertedRows", async () => {
    await freshPo(PO);
    const r = await stampErpSuccess(PO, 2, new Date("2026-09-11T04:00:00Z"));
    expect(r.stamped).toBe(true);

    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: PO } });
    expect(row?.erpSentAt).not.toBeNull();
    expect(row?.erpAttemptedAt).not.toBeNull();
    expect(row?.erpInsertedRows).toBe(2);
  });

  it("**ประทับซ้ำใบเดิมไม่สำเร็จ** — คนที่สองต้องรู้ว่าแพ้", async () => {
    await freshPo(PO);
    const first = await stampErpSuccess(PO, 2);
    const second = await stampErpSuccess(PO, 99);

    expect(first.stamped).toBe(true);
    expect(second.stamped).toBe(false);

    // ค่าของคนแรกต้องไม่ถูกเขียนทับ
    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: PO } });
    expect(row?.erpInsertedRows).toBe(2);
  });

  it("กดพร้อมกันจริง ๆ ก็ยังมีคนเดียวที่ชนะ", async () => {
    await freshPo(PO);
    const results = await Promise.all([
      stampErpSuccess(PO, 1),
      stampErpSuccess(PO, 1),
      stampErpSuccess(PO, 1),
    ]);
    expect(results.filter((r) => r.stamped)).toHaveLength(1);
  });

  it("ล้มเหลว = ไม่แตะ erpSentAt ใบยังอยู่ในคิว", async () => {
    await freshPo(PO);
    await stampErpFailure(PO, "orderNo and customerCode already exists within 6 months");

    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: PO } });
    expect(row?.erpSentAt).toBeNull();
    expect(row?.erpAttemptedAt).not.toBeNull();
    expect(row?.erpError).toContain("already exists");

    // ยังอยู่ในคิวจริง — query เดียวกับที่ตัวส่งจะใช้หาใบที่ยังไม่ผ่าน
    const queued = await prisma.purchaseOrder.count({ where: { erpSentAt: null } });
    expect(queued).toBe(1);
  });

  it("ส่งสำเร็จทีหลังไม่ล้าง erpError — ประวัติว่าเคยพลาดยังอยู่", async () => {
    await freshPo(PO);
    await stampErpFailure(PO, "ปลายทางไม่ตอบ");
    const r = await stampErpSuccess(PO, 1);

    expect(r.stamped).toBe(true);
    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: PO } });
    expect(row?.erpSentAt).not.toBeNull();
    expect(row?.erpError).toContain("ปลายทางไม่ตอบ");
  });

  it("ข้อความยาวเกินถูกตัดก่อนลงฐานข้อมูล", async () => {
    await freshPo(PO);
    await stampErpFailure(PO, "x".repeat(5000));
    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: PO } });
    expect(row?.erpError?.length).toBe(1000);
  });
});
