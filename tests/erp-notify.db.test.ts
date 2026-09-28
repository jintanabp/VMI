import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * แจ้งเตือนผลส่ง ERP (QA 28 ก.ย. 69 — เดิมไม่แจ้งใครเลย)
 *
 * เครื่อง dev ปิดขาส่ง ERP ไว้ จึงทดสอบเฉพาะตัวแจ้งเตือนที่ send-erp route เรียกหลังรู้ผล
 * **ไม่มีการเรียก deliverPoToErp / postErpPayload ในไฟล์นี้**
 */
const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("notifyErpSendResult", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let mod: typeof import("@/lib/po/erp-notify");
  let storeId: string;
  let orderId: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-erp-notify");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    mod = await import("@/lib/po/erp-notify");
    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    storeId = store.id;
    const order = await prisma.order.create({ data: { storeId } });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  it("ERP ปฏิเสธ = แจ้งเซลล์ของคลัง พร้อมเลข PO และสาเหตุสั้น ๆ", async () => {
    await mod.notifyErpSendResult({
      ok: false,
      poNumber: "V126092801A",
      orderId,
      storeId,
      actorEmail: "sales@example.com",
      failure: "rejected",
      message: "orderNo and customerCode already exists within 6 months",
    });
    const rows = await prisma.salesNotification.findMany({
      where: { storeId, kind: "erp_failed" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toContain("V126092801A");
    expect(rows[0]!.detail).toContain("already exists");
    expect(rows[0]!.detail).toContain("ขอเลขใหม่");
    expect(rows[0]!.orderId).toBe(orderId);
  });

  it("timeout = แจ้งเซลล์ว่าห้ามส่งซ้ำ · ข้อความยาวถูกตัด", async () => {
    await mod.notifyErpSendResult({
      ok: false,
      poNumber: "V126092802A",
      orderId,
      storeId,
      actorEmail: "sales@example.com",
      failure: "timeout",
      message: "x".repeat(900),
    });
    const row = await prisma.salesNotification.findFirst({
      where: { storeId, kind: "erp_failed", title: { contains: "V126092802A" } },
    });
    expect(row?.detail).toContain("ห้ามส่งซ้ำ");
    expect(row!.detail.length).toBeLessThan(400);
  });

  it("not_ready ไม่ได้ยิงอะไรออกไป = ไม่แจ้ง", async () => {
    await mod.notifyErpSendResult({
      ok: false,
      poNumber: "V126092803A",
      orderId,
      storeId,
      actorEmail: "sales@example.com",
      failure: "not_ready",
      message: "ยังไม่ได้กำหนดวันส่งของ",
    });
    const n = await prisma.salesNotification.count({
      where: { title: { contains: "V126092803A" } },
    });
    expect(n).toBe(0);
  });

  it("ส่งสำเร็จ = แจ้งร้านครั้งเดียว แม้ถูกเรียกซ้ำ (สองคำขอแข่งกัน)", async () => {
    const args = {
      ok: true as const,
      poNumber: "V126092804A",
      orderId,
      storeId,
      actorEmail: "sales@example.com",
    };
    await mod.notifyErpSendResult(args);
    await mod.notifyErpSendResult(args);
    const rows = await prisma.storeNotification.findMany({
      where: { storeId, kind: "po_sent_erp" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.poNumbers).toBe("V126092804A");
  });
});
