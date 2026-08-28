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
 * การอนุมัติออเดอร์แบบ atomic (commit 40b089a)
 *
 * เป็นโค้ดที่พังแล้วเสียหายจริงที่สุดในระบบ: mint เลข PO (ใช้ซ้ำไม่ได้) เขียนไฟล์
 * เอกสารลงดิสก์ และพลิกสถานะออเดอร์ ทั้งหมดในลำดับที่ห้ามสลับ เดิมเป็น
 * read-then-act — สองคนกดอนุมัติพร้อมกันผ่านด่านอ่านทั้งคู่ ต่างคนต่าง mint เลข
 * แล้วคนแพ้ค่อยตายที่ @@unique(orderId, groupKey) หลังเผาเลขและทิ้งไฟล์กำพร้าไปแล้ว
 *
 * พิสูจน์ด้วย pure function ไม่ได้ ต้องมีฐานข้อมูลจริง — จึงเป็นเทสต์ชุดแรกที่
 * ใช้ SQLite ชั่วคราว (ดู tests/helpers/test-db.ts)
 */

const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("approveWithPoSplit — ชนกันระหว่างอนุมัติ", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let approveWithPoSplit: typeof import("@/lib/po/approve-with-split").approveWithPoSplit;
  let rejectOrder: (
    id: string,
    reason: string,
    actor: string
  ) => Promise<unknown>;
  let poExportDir: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-approve");
    // ต้องตั้งก่อน import — lib/prisma อ่าน DATABASE_URL ตอนสร้าง client
    setTestDatabaseUrl(db.url);

    // เอกสาร PO เขียนลง <cwd>/logs/po-export — ย้าย cwd ไป temp กันไฟล์ปนของจริง
    poExportDir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-po-"));
    process.chdir(poExportDir);

    ({ approveWithPoSplit } = await import("@/lib/po/approve-with-split"));
    ({ prisma } = await import("@/lib/prisma"));
    const { getRepositories } = await import("@/lib/repositories");
    rejectOrder = (id, reason, actor) =>
      getRepositories().orders.rejectOrder(id, reason, actor);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  beforeEach(async () => {
    // ลำดับสำคัญ: ลบลูกก่อนแม่ (SQLite ไม่ได้ตั้ง cascade ทุกความสัมพันธ์)
    await prisma.orderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.order.deleteMany();
    await prisma.store.deleteMany();
    await prisma.sku.deleteMany();
    await prisma.poSequence.deleteMany();
  });

  it("สองคนกดอนุมัติพร้อมกัน → สำเร็จคนเดียว อีกคนได้ ORDER_ALREADY_DECIDED", async () => {
    const { orderId } = await seedPendingOrder(prisma);

    const results = await Promise.allSettled([
      approveWithPoSplit(orderId, "a@x.com", {}),
      approveWithPoSplit(orderId, "b@x.com", {}),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason.message).toBe(
      "ORDER_ALREADY_DECIDED"
    );
  });

  it("ชนกันแล้วต้องได้ PO ชุดเดียว ไม่ใช่สองชุด (เลข PO ใช้ซ้ำไม่ได้)", async () => {
    const { orderId } = await seedPendingOrder(prisma);

    await Promise.allSettled([
      approveWithPoSplit(orderId, "a@x.com", {}),
      approveWithPoSplit(orderId, "b@x.com", {}),
    ]);

    const pos = await prisma.purchaseOrder.findMany({ where: { orderId } });
    expect(pos).toHaveLength(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe("approved");
    // ผู้ชนะเท่านั้นที่ได้ประทับชื่อ — ไม่ใช่คนที่มาทีหลังทับ
    expect(["a@x.com", "b@x.com"]).toContain(order?.decidedBy);
  });

  it("อนุมัติชนกับปฏิเสธ → จบที่สถานะเดียว ไม่ใช่ approved ที่มี rejectReason", async () => {
    const { orderId } = await seedPendingOrder(prisma);

    const results = await Promise.allSettled([
      approveWithPoSplit(orderId, "a@x.com", {}),
      rejectOrder(orderId, "ของไม่พอ", "b@x.com"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order?.status === "approved") {
      expect(order.rejectReason).toBeNull();
      expect(await prisma.purchaseOrder.count({ where: { orderId } })).toBe(1);
    } else {
      expect(order?.status).toBe("rejected");
      expect(order?.rejectReason).toBe("ของไม่พอ");
      // ปฏิเสธชนะ = ต้องไม่มี PO หลงเหลือ
      expect(await prisma.purchaseOrder.count({ where: { orderId } })).toBe(0);
    }
  });

  it("อนุมัติซ้ำหลังจบไปแล้ว → ปฏิเสธ ไม่ออก PO ใบที่สอง", async () => {
    const { orderId } = await seedPendingOrder(prisma);
    await approveWithPoSplit(orderId, "a@x.com", {});

    await expect(
      approveWithPoSplit(orderId, "a@x.com", {})
    ).rejects.toThrow("ORDER_ALREADY_DECIDED");

    expect(await prisma.purchaseOrder.count({ where: { orderId } })).toBe(1);
  });

  it("พังหลังจองออเดอร์ (เลข PO ที่พิมพ์เองผิดรูปแบบ) → สถานะถอยกลับเป็นรอตรวจ", async () => {
    const { orderId } = await seedPendingOrder(prisma);

    // เลขยาวเกิน 12 ตัว → checkPoNumberFormat โยนหลัง claim สำเร็จไปแล้ว
    await expect(
      approveWithPoSplit(orderId, "a@x.com", { A: "PO-THIS-IS-WAY-TOO-LONG" })
    ).rejects.toThrow();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe("pending_approval");
    expect(order?.approvedAt).toBeNull();
    expect(order?.decidedAt).toBeNull();
    // decidedBy เป็น String non-null (@default("")) — rollback จึงคืนเป็นค่าว่าง
    expect(order?.decidedBy).toBe("");
    expect(await prisma.purchaseOrder.count({ where: { orderId } })).toBe(0);
  });

  it("ถอยกลับแล้วอนุมัติใหม่ได้จริง — ไม่ค้างจนต้องแก้มือใน DB", async () => {
    const { orderId } = await seedPendingOrder(prisma);

    await expect(
      approveWithPoSplit(orderId, "a@x.com", { A: "PO-THIS-IS-WAY-TOO-LONG" })
    ).rejects.toThrow();

    const result = await approveWithPoSplit(orderId, "a@x.com", {});
    expect(result.purchaseOrders).toHaveLength(1);
    expect(
      (await prisma.order.findUnique({ where: { id: orderId } }))?.status
    ).toBe("approved");
  });

  it("บรรทัดที่ถูกตัดเหลือจำนวน 0 ไม่หลุดเข้าเอกสาร PO", async () => {
    const { orderId, itemIds } = await seedPendingOrder(prisma, {
      qtys: [10, 20],
    });
    await prisma.orderItem.update({
      where: { id: itemIds[0] },
      data: { finalQty: 0 },
    });

    const result = await approveWithPoSplit(orderId, "a@x.com", {});
    const doc = JSON.parse(
      fs.readFileSync(result.purchaseOrders[0]!.exportPath, "utf-8")
    ) as { lines: { qty: number }[]; itemCount: number };

    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.qty).toBe(20);

    // แถว PurchaseOrder ต้องนับตรงกับเอกสาร ไม่งั้น po-from-db จะประกอบไม่ตรงไฟล์
    const po = await prisma.purchaseOrder.findFirst({ where: { orderId } });
    expect(po?.itemCount).toBe(1);
  });
});
