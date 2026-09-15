import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * ขอเลขใหม่ให้ใบที่ ERP ปฏิเสธ (clone-for-erp) — ทำตามแนว ocr-po-matching
 *
 * ต้องทดสอบกับฐานข้อมูลจริงเพราะจุดที่พังได้แพงที่สุดคือการแข่งกัน (compare-and-set บน
 * `replacedByPoNumber`) — เหมือน erp-stamp.db.test.ts แต่ที่นี่พิสูจน์ว่า "ขอเลขใหม่ซ้ำ
 * สองครั้งพร้อมกันบนใบเดียวกัน ต้องได้ใบใหม่แค่ใบเดียว ไม่ใช่สองใบซ้อนกัน"
 *
 * ⚠️ **บั๊กที่เจอจริงแล้วแก้ในไฟล์นี้ (14 ก.ย. 69):** ลืม `process.chdir` ไปโฟลเดอร์ temp
 * เหมือนที่ approve-with-split.db.test.ts ทำไว้ — `cloneRejectedPoForErp` เรียก
 * `writePoDocument()` ซึ่งเขียนลง `<cwd>/logs/po-export/{poNumber}.json` เป็น **ไฟล์จริง
 * บนดิสก์** ไม่ใช่แค่แถวในฐานข้อมูลทดสอบที่แยกไว้แล้ว ⇒ ตอนรันเทสต์ชุดนี้ (สร้าง store
 * "vda1" เองแล้ว mint เลข V1<วันนี้><ลำดับ>) เผลอเขียนทับไฟล์ export ของ PO จริงในเครื่อง
 * ที่บังเอิญได้เลขชนกัน (`V126091401` — "PO แรกของ vda1 วันนี้" ชนกันทั้งฐานทดสอบและฐานจริง)
 * ทำให้หน้าเว็บโชว์ข้อมูลผิดใบแม้ฐานข้อมูลจริงจะถูกต้อง — เจอจาก QA agent ที่เปิดหน้าจริงแล้วเห็น
 * SKU/ราคาที่ไม่ตรงกับที่สร้างไว้ ตามด้วยตรวจ DB ตรง ๆ เทียบกับไฟล์ที่ export ไว้
 */

const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("cloneRejectedPoForErp", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let cloneRejectedPoForErp: typeof import("@/lib/po/clone-for-erp").cloneRejectedPoForErp;
  let storeId: string;
  let skuIds: string[];

  beforeAll(async () => {
    db = createTestDatabase("vmi-erp-clone");
    setTestDatabaseUrl(db.url);

    // เอกสาร PO เขียนลง <cwd>/logs/po-export — ย้าย cwd ไป temp กันไฟล์ปนของจริง
    // (แนวเดียวกับ approve-with-split.db.test.ts)
    const poExportDir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-po-clone-"));
    process.chdir(poExportDir);

    ({ prisma } = await import("@/lib/prisma"));
    ({ cloneRejectedPoForErp } = await import("@/lib/po/clone-for-erp"));

    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    storeId = store.id;
    const sku1 = await prisma.sku.create({ data: { code: "744318", name: "สินค้าทดสอบ 1" } });
    const sku2 = await prisma.sku.create({ data: { code: "744319", name: "สินค้าทดสอบ 2" } });
    skuIds = [sku1.id, sku2.id];
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  /** ออเดอร์ + PO ที่ถูก ERP ปฏิเสธแล้ว (erpError ตั้งไว้, erpSentAt ว่าง) พร้อม 2 บรรทัด */
  async function rejectedPo(poNumber: string) {
    const order = await prisma.order.create({
      data: {
        storeId,
        deliveryDate: new Date("2026-09-20T00:00:00+07:00"),
      },
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        orderId: order.id,
        poNumber,
        groupKey: "A",
        priceKind: "c4",
        itemCount: 2,
        totalQty: 4,
        totalAmount: 2200,
        erpError: "orderNo and customerCode already exists within 6 months",
        erpFailureKind: "rejected",
      },
    });
    for (const skuId of skuIds) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          skuId,
          suggestedQty: 2,
          finalQty: 2,
          c4UnitPrice: 500,
          priceFlagged: false,
          poGroup: "A",
          purchaseOrderId: po.id,
        },
      });
    }
    return { order, po };
  }

  // timeout ยาวกว่าปกติ — เทสนี้ทั้ง mint เลข + เขียนไฟล์ + transaction สร้าง PO/OrderItem
  // จริง ซึ่งช้ากว่าเทส DB อื่นในไฟล์นี้ พอรันพร้อมไฟล์เทสอื่นทั้งชุด (หลาย worker แย่ง I/O)
  // เคยเกิน 5000ms ของ default จนเทสรายงานว่า timeout ทั้งที่ logic ไม่ได้พัง
  it("ขอเลขใหม่ได้ — ใบใหม่คัดลอกเนื้อหาเดิม ใบเก่าถูกปักว่าแทนที่แล้ว", async () => {
    const { order, po } = await rejectedPo("V226091401A");

    const result = await cloneRejectedPoForErp(po.poNumber, "sales@example.com");
    expect(result.replaces).toBe(po.poNumber);
    expect(result.poNumber).not.toBe(po.poNumber);

    const oldRow = await prisma.purchaseOrder.findUnique({ where: { poNumber: po.poNumber } });
    expect(oldRow?.replacedByPoNumber).toBe(result.poNumber);
    expect(oldRow?.erpVoidedAt).not.toBeNull();

    const newRow = await prisma.purchaseOrder.findUnique({
      where: { poNumber: result.poNumber },
      include: { items: true },
    });
    expect(newRow?.erpReplacesPoNumber).toBe(po.poNumber);
    expect(newRow?.orderId).toBe(order.id);
    expect(newRow?.groupKey).not.toBe("A"); // ต้องเป็นกลุ่มใหม่ ไม่ชน @@unique([orderId, groupKey])
    expect(newRow?.itemCount).toBe(2);
    expect(newRow?.totalQty).toBe(4);
    expect(newRow?.erpSentAt).toBeNull();
    expect(newRow?.erpError).toBeNull();
    expect(newRow?.items).toHaveLength(2);
    // แถวใหม่ต้องเป็นคนละ id จากแถวเดิม (คัดลอก ไม่ใช่ย้าย)
    const oldItemIds = await prisma.orderItem.findMany({
      where: { purchaseOrderId: po.id },
      select: { id: true },
    });
    const newItemIds = newRow!.items.map((i) => i.id);
    for (const oldItem of oldItemIds) {
      expect(newItemIds).not.toContain(oldItem.id);
    }
    // ราคา/จำนวนที่ copy มาต้องตรงกับต้นฉบับ
    expect(newRow?.items.every((i) => i.c4UnitPrice === 500 && i.finalQty === 2)).toBe(true);
  }, 15_000);

  it("ใบที่ยังไม่เคยส่งไม่สำเร็จ (erpError ว่าง) ขอเลขใหม่ไม่ได้", async () => {
    const order = await prisma.order.create({ data: { storeId } });
    const po = await prisma.purchaseOrder.create({
      data: {
        orderId: order.id,
        poNumber: "V226091402A",
        groupKey: "A",
        priceKind: "c4",
        itemCount: 0,
        totalQty: 0,
        totalAmount: 0,
      },
    });
    await expect(cloneRejectedPoForErp(po.poNumber, "sales@example.com")).rejects.toThrow(
      "NOT_REJECTED"
    );
  });

  it("ล้มเหลวแบบ timeout/network — ไม่รู้ว่าเข้าไปแล้วหรือไม่ ขอเลขใหม่ไม่ได้", async () => {
    const order = await prisma.order.create({ data: { storeId } });
    const po = await prisma.purchaseOrder.create({
      data: {
        orderId: order.id,
        poNumber: "V226091406A",
        groupKey: "A",
        priceKind: "c4",
        itemCount: 1,
        totalQty: 2,
        totalAmount: 1000,
        erpError: "ปลายทางไม่ตอบภายใน 15 วินาที",
        erpFailureKind: "timeout",
      },
    });
    await expect(cloneRejectedPoForErp(po.poNumber, "sales@example.com")).rejects.toThrow(
      "AMBIGUOUS_FAILURE"
    );
  });

  it("แถวเก่าก่อนมีคอลัมน์นี้ (erpFailureKind ว่าง) ก็ถือว่าไม่ชัดเจน ห้ามขอเลขใหม่", async () => {
    const order = await prisma.order.create({ data: { storeId } });
    const po = await prisma.purchaseOrder.create({
      data: {
        orderId: order.id,
        poNumber: "V226091407A",
        groupKey: "A",
        priceKind: "c4",
        itemCount: 1,
        totalQty: 2,
        totalAmount: 1000,
        erpError: "some legacy error before erpFailureKind existed",
      },
    });
    await expect(cloneRejectedPoForErp(po.poNumber, "sales@example.com")).rejects.toThrow(
      "AMBIGUOUS_FAILURE"
    );
  });

  it("ใบที่ส่งสำเร็จไปแล้วขอเลขใหม่ไม่ได้ แม้จะมี erpError ค้างจากครั้งก่อน", async () => {
    const { po } = await rejectedPo("V226091403A");
    await prisma.purchaseOrder.update({
      where: { poNumber: po.poNumber },
      data: { erpSentAt: new Date() },
    });
    await expect(cloneRejectedPoForErp(po.poNumber, "sales@example.com")).rejects.toThrow(
      "ALREADY_SENT"
    );
  });

  it("ขอเลขใหม่ซ้ำสองครั้งบนใบเดิมไม่ได้ — ครั้งที่สองต้องรู้ว่ามีคนขอไปแล้ว", async () => {
    const { po } = await rejectedPo("V226091404A");
    await cloneRejectedPoForErp(po.poNumber, "sales@example.com");
    await expect(cloneRejectedPoForErp(po.poNumber, "sales@example.com")).rejects.toThrow(
      "ALREADY_REPLACED:"
    );
  });

  it("กดขอเลขใหม่พร้อมกันสองครั้ง — ต้องได้ใบใหม่แค่ใบเดียว", async () => {
    const { po, order } = await rejectedPo("V226091405A");
    const results = await Promise.allSettled([
      cloneRejectedPoForErp(po.poNumber, "sales@example.com"),
      cloneRejectedPoForErp(po.poNumber, "sales@example.com"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const siblings = await prisma.purchaseOrder.findMany({ where: { orderId: order.id } });
    // ใบเดิม + ใบใหม่ 1 ใบเท่านั้น — ไม่มีใบกำพร้าจากฝั่งที่แพ้
    expect(siblings).toHaveLength(2);
  });
});
