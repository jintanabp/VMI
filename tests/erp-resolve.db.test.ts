import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * แก้สถานะ "ERP ไม่ตอบ — รอตรวจ" หลังตรวจกับทีม ERP (29 ก.ย. 2569)
 * ไม่ยิงอะไรออกเน็ต — ทดสอบแค่การเปลี่ยนแถวในฐานข้อมูลและด่านกันใบที่ไม่ใช่เคสนี้
 */

const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("resolveAmbiguousErpResult", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let mod: typeof import("@/lib/po/erp-resolve");
  let orderId: string;
  let storeId: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-erp-resolve");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    mod = await import("@/lib/po/erp-resolve");
    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    storeId = store.id;
    const order = await prisma.order.create({ data: { storeId: store.id, status: "approved" } });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  async function po(
    poNumber: string,
    data: {
      status?: string;
      erpError?: string | null;
      erpFailureKind?: string | null;
      erpSentAt?: Date | null;
      replacedByPoNumber?: string | null;
    }
  ) {
    await prisma.purchaseOrder.deleteMany({ where: { poNumber } });
    return prisma.purchaseOrder.create({
      data: {
        orderId,
        poNumber,
        groupKey: poNumber, // ไม่ซ้ำกันต่อออเดอร์ (@@unique orderId+groupKey)
        priceKind: "c4",
        itemCount: 1,
        totalQty: 5,
        totalAmount: 5250,
        erpAttemptedAt: data.erpError ? new Date() : null,
        ...data,
      },
    });
  }

  const resolve = (poNumber: string, resolution: "in_erp" | "not_in_erp") =>
    mod.resolveAmbiguousErpResult({
      poNumber,
      resolution,
      note: "คุณเอ ทีม ERP",
      actorEmail: "sales@vmi.test",
    });

  it("มีใน ERP → ปักส่งสำเร็จ + สถานะเข้า ERP แล้ว + ล้าง error", async () => {
    await po("P1A", { status: "erp_unknown", erpError: "timeout", erpFailureKind: "timeout" });
    const r = await resolve("P1A", "in_erp");
    expect(r).toMatchObject({ previousError: "timeout", orderId, storeId });
    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: "P1A" } });
    expect(row?.erpSentAt).not.toBeNull();
    expect(row?.status).toBe("sent_erp");
    expect(row?.erpError).toBeNull();
    expect(row?.statusNote).toContain("คุณเอ ทีม ERP");
  });

  it("ไม่มีใน ERP → กลับเป็นออกแล้ว ล้างผลส่งเดิม ส่งใหม่ด้วยเลขเดิมได้", async () => {
    await po("P2A", { status: "erp_unknown", erpError: "network", erpFailureKind: "network" });
    await resolve("P2A", "not_in_erp");
    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: "P2A" } });
    expect(row).toMatchObject({
      status: "issued",
      erpSentAt: null,
      erpAttemptedAt: null,
      erpError: null,
      erpFailureKind: null,
    });
  });

  it("แถวเก่า (failureKind ว่าง) ที่คนตั้งสถานะอื่นไว้ — แก้ได้ และคงสถานะเดิม", async () => {
    await po("P3A", { status: "sent", erpError: "เก่า", erpFailureKind: null });
    await resolve("P3A", "not_in_erp");
    const row = await prisma.purchaseOrder.findUnique({ where: { poNumber: "P3A" } });
    expect(row?.status).toBe("sent");
    expect(row?.erpError).toBeNull();
  });

  it("ใบที่ไม่ใช่เคสไม่รู้ผล แก้ไม่ได้", async () => {
    await po("P4A", { erpError: "ซ้ำ", erpFailureKind: "rejected" });
    await po("P5A", {});
    await po("P6A", { erpSentAt: new Date(), status: "sent_erp" });
    await po("P7A", { erpError: "t", erpFailureKind: "timeout", replacedByPoNumber: "P7B" });
    await po("P8A", { erpError: "t", erpFailureKind: "timeout", status: "sending_erp" });
    const codeOf = (p: Promise<unknown>) =>
      p.then(
        () => "ok",
        (e: { code?: string }) => e.code
      );
    expect(await codeOf(resolve("P4A", "not_in_erp"))).toBe("NOT_AMBIGUOUS");
    expect(await codeOf(resolve("P5A", "in_erp"))).toBe("NOT_AMBIGUOUS");
    expect(await codeOf(resolve("P6A", "in_erp"))).toBe("ALREADY_SENT");
    expect(await codeOf(resolve("P7A", "in_erp"))).toBe("REPLACED");
    expect(await codeOf(resolve("P8A", "in_erp"))).toBe("SENDING");
    expect(await codeOf(resolve("NOPE", "in_erp"))).toBe("PO_NOT_FOUND");
  });

  it("กดพร้อมกันสองคน — สำเร็จคนเดียว อีกคนได้ CHANGED", async () => {
    await po("P9A", { status: "erp_unknown", erpError: "timeout", erpFailureKind: "timeout" });
    const results = await Promise.allSettled([resolve("P9A", "in_erp"), resolve("P9A", "not_in_erp")]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed.map((f) => (f.reason as { code: string }).code)).toEqual(["CHANGED"]);
  });
});
