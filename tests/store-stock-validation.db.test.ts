import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * ตรวจค่าที่ส่งเข้า min/max และรายการหยุดสั่ง (QA 28 ก.ย. 69)
 *
 * เคสที่เจ็บถ้าพลาด:
 *   - PATCH ที่ไม่มี min/max เลยรีเซ็ตทั้งแบรนด์เป็น 7/15 แล้วตอบ 200
 *   - skuId ที่ไม่มีจริงชน FK กลายเป็น 500
 *   - วันเริ่มหยุดสั่งพิมพ์ปีผิดย้อนหลังไปไกลก็บันทึกได้
 */

const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("thresholds / blocklist validation", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let thresholds: typeof import("@/lib/stock/thresholds-service");
  let blocks: typeof import("@/lib/stock/blocklist-service");
  let storeId: string;
  let skuId: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-stock-validation");
    setTestDatabaseUrl(db.url);

    ({ prisma } = await import("@/lib/prisma"));
    thresholds = await import("@/lib/stock/thresholds-service");
    blocks = await import("@/lib/stock/blocklist-service");

    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    const sku = await prisma.sku.create({ data: { code: "111111", name: "สินค้าทดสอบ" } });
    storeId = store.id;
    skuId = sku.id;
    await prisma.storeGroupThreshold.create({
      data: { storeId, section: "BRAND", minDays: 3, maxDays: 30 },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  describe("applyThresholdPatch", () => {
    it("ไม่ส่ง min/max มาเลย → 400 และค่ากลุ่มเดิมไม่ถูกรีเซ็ต", async () => {
      const r = await thresholds.applyThresholdPatch(storeId, { section: "BRAND" });
      expect(r.status).toBe(400);
      const g = await prisma.storeGroupThreshold.findUniqueOrThrow({
        where: { storeId_section: { storeId, section: "BRAND" } },
      });
      expect([g.minDays, g.maxDays]).toEqual([3, 30]);
    });

    it("ส่งมาแค่ตัวเดียว → 400", async () => {
      const r = await thresholds.applyThresholdPatch(storeId, {
        section: "BRAND",
        minDays: 5,
      });
      expect(r.status).toBe(400);
    });

    it.each([
      [{ minDays: 1.5, maxDays: 10 }],
      [{ minDays: -1, maxDays: 10 }],
      [{ minDays: 10, maxDays: 5 }],
      [{ minDays: 0, maxDays: 366 }],
    ])("ค่าผิดกติกา %j → 400", async (days) => {
      const r = await thresholds.applyThresholdPatch(storeId, {
        section: "BRAND",
        ...days,
      });
      expect(r.status).toBe(400);
    });

    it("ขอบบน 0..365 ใช้ได้", async () => {
      const r = await thresholds.applyThresholdPatch(storeId, {
        section: "BRAND",
        minDays: 0,
        maxDays: 365,
      });
      expect(r.status).toBe(200);
    });

    it("skuId ที่ไม่มีจริง → 400 ไม่ใช่ 500", async () => {
      const r = await thresholds.applyThresholdPatch(storeId, {
        skuId: "does-not-exist",
        minDays: 3,
        maxDays: 10,
      });
      expect(r.status).toBe(400);
    });

    it("reset พร้อม skuId ที่ไม่มีจริง → 400 และค่ากลุ่มยังอยู่", async () => {
      const r = await thresholds.applyThresholdPatch(storeId, {
        reset: true,
        section: "BRAND",
        skuIds: ["does-not-exist"],
      });
      expect(r.status).toBe(400);
      expect(
        await prisma.storeGroupThreshold.count({ where: { storeId, section: "BRAND" } })
      ).toBe(1);
    });

    it("skuId ที่มีจริง → 200", async () => {
      const r = await thresholds.applyThresholdPatch(storeId, {
        skuId,
        minDays: 3,
        maxDays: 10,
      });
      expect(r.status).toBe(200);
    });
  });

  describe("upsertBlocks", () => {
    const DAY = 86_400_000;

    it("วันเริ่มย้อนหลังเกิน 1 วัน (รายการใหม่) → 400", async () => {
      const r = await blocks.upsertBlocks(storeId, "a@vmi.test", {
        skuIds: [skuId],
        reason: "ทดสอบ",
        effectiveFrom: new Date(Date.now() - 3 * DAY).toISOString(),
      });
      expect(r.status).toBe(400);
      expect(await prisma.storeSkuBlock.count({ where: { storeId } })).toBe(0);
    });

    it("วันเริ่มอ่านไม่ออก → 400", async () => {
      const r = await blocks.upsertBlocks(storeId, "a@vmi.test", {
        skuIds: [skuId],
        reason: "ทดสอบ",
        effectiveFrom: "ไม่ใช่วันที่",
      });
      expect(r.status).toBe(400);
    });

    it("skuId ที่ไม่มีจริงปนมา → 400 และไม่บันทึกตัวที่เจอ", async () => {
      const r = await blocks.upsertBlocks(storeId, "a@vmi.test", {
        skuIds: [skuId, "does-not-exist"],
        reason: "ทดสอบ",
      });
      expect(r.status).toBe(400);
      expect(await prisma.storeSkuBlock.count({ where: { storeId } })).toBe(0);
    });

    it("แก้รายการเดิมที่เริ่มไปนานแล้ว (ส่งวันเริ่มเดิมกลับมา) → ยังแก้ได้", async () => {
      const oldFrom = new Date(Date.now() - 10 * DAY);
      await prisma.storeSkuBlock.create({
        data: {
          storeId,
          skuId,
          reason: "เดิม",
          effectiveFrom: oldFrom,
          createdBy: "a@vmi.test",
        },
      });
      // ฟอร์มใช้ datetime-local — วินาทีหาย เหลือระดับนาที
      const sentBack = new Date(Math.floor(oldFrom.getTime() / 60_000) * 60_000);
      const r = await blocks.upsertBlocks(storeId, "b@vmi.test", {
        skuIds: [skuId],
        reason: "แก้เหตุผล",
        effectiveFrom: sentBack.toISOString(),
      });
      expect(r.status).toBe(200);
      const row = await prisma.storeSkuBlock.findUniqueOrThrow({
        where: { storeId_skuId: { storeId, skuId } },
      });
      expect(row.reason).toBe("แก้เหตุผล");
      expect(row.createdBy).toBe("b@vmi.test");
    });

    it("แต่เลื่อนวันเริ่มของรายการเดิมไปย้อนหลังไกลกว่าเดิม → 400", async () => {
      const r = await blocks.upsertBlocks(storeId, "b@vmi.test", {
        skuIds: [skuId],
        reason: "แก้เหตุผล",
        effectiveFrom: new Date(Date.now() - 30 * DAY).toISOString(),
      });
      expect(r.status).toBe(400);
    });
  });
});
