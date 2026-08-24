import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * บริบทที่ใช้ค้นโปร C4 ของแต่ละร้าน
 *
 * บั๊กที่ต้องกันไม่ให้กลับมา: ร้านค้าจริงไม่เห็นโปรเลยสักตัว
 *
 * cft_promotion_cash.csv มี (DIVISIONSALE|CUSTOMERGROUP) เดียวคือ E|98 ทั้งไฟล์
 * แต่โค้ดเดิมอ่าน cusGroup ของร้านจาก dim_customer ตรง ๆ ซึ่งร้านจริงเป็น 99 ทุกร้าน
 * → rowsFor(E, 99, ...) คืน 0 แถวเสมอ คอลัมน์โปรขึ้น "—" ทั้งหน้า ทั้งที่ C4 มีโปรอยู่
 * และไม่มี error ที่ไหนเลย
 *
 * กฎที่ถูกคือ "โปรผูกกับคลังที่จ่ายของ" — โปรชุดนี้เป็นเงื่อนไขของคลัง VDA
 * ร้านสั่งผ่านคลังจึงต้องได้บริบทเดียวกับคลัง
 */

const CUSTOMER_99 = {
  getByCode: () => ({ cusGroup: "99", area: "SOUTH" }),
};

/** โหลด resolvePromoContext ใหม่พร้อม mock ชุดหนึ่ง — ต้อง resetModules ก่อนเสมอ */
async function loadResolver(opts: {
  sources: string[];
  mastersReady?: boolean;
}) {
  vi.doMock("@/lib/fabric", () => ({
    fabricMastersReady: () => opts.mastersReady ?? true,
    getCustomerDirectory: () => CUSTOMER_99,
    getSalesmanRegistry: () => ({ getCurrentByEmail: () => null }),
  }));
  vi.doMock("@/lib/fabric/stock-cover", () => ({
    fabricStockReady: () => opts.sources.length > 0,
  }));
  vi.doMock("@/lib/fabric/stock-rows", () => ({
    listStockFromDbSources: () => opts.sources,
  }));
  const mod = await import("@/lib/fabric/promotion-context");
  return mod.resolvePromoContext;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("C4_DEFAULT_DIVISION", "E");
  vi.stubEnv("C4_DEFAULT_CUSGROUP", "98");
  vi.stubEnv("C4_DEFAULT_REGION", "COUNTRY");
  vi.stubEnv("C4_VDA_DIVISION_MAP", "vda1:E,vda4:E");
  vi.stubEnv("STOCK_FROM_DB_OPTIONS", "");
  vi.stubEnv("STOCK_FROM_DB_DEFAULT", "");
  vi.stubEnv("STOCK_COVER_FROM_DB", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("resolvePromoContext", () => {
  it("รหัสคลัง VDA ใช้บริบทของตัวเอง", async () => {
    const resolve = await loadResolver({ sources: ["vda1", "vda4"] });

    expect(resolve("vda4")).toEqual({
      division: "E",
      cusgroup: "98",
      region: "COUNTRY",
      isVda: true,
      vdaCode: "vda4",
    });
  });

  it("ร้านค้าใช้บริบทของคลังที่จ่ายของ ไม่ใช่ cusGroup ของตัวเองจาก dim_customer", async () => {
    const resolve = await loadResolver({ sources: ["vda1", "vda4"] });

    const ctx = resolve("6043757");

    // ห้ามเป็น 99/SOUTH ที่มาจาก dim_customer — ไฟล์โปรไม่มีบริบทนั้นเลย
    expect(ctx.cusgroup).toBe("98");
    expect(ctx.region).toBe("COUNTRY");
    expect(ctx.division).toBe("E");
    expect(ctx.isVda).toBe(false);
    expect(ctx.vdaCode).toBe("vda1");
    expect(ctx.storeCode).toBe("6043757");
  });

  it("ระบุคลังมาเอง (fromDb) → ใช้คลังนั้น ให้ตรงกับที่หน้าสต็อกกำลังแสดง", async () => {
    const resolve = await loadResolver({ sources: ["vda1", "vda4"] });

    expect(resolve("6043757", { fromDb: "vda4" }).vdaCode).toBe("vda4");
  });

  it("เซลล์เปิดดูก็ได้บริบทของคลังเหมือนกัน — โปรผูกกับคลัง ไม่ได้ผูกกับเซลล์", async () => {
    const resolve = await loadResolver({ sources: ["vda1"] });

    const ctx = resolve("6043757", { salesRepEmail: "rep@example.com" });

    expect(ctx.division).toBe("E");
    expect(ctx.cusgroup).toBe("98");
  });

  it("ยังไม่มีคลังในระบบ → ถอยไปใช้ข้อมูลลูกค้าแบบเดิม ดีกว่าเดาคลังมั่ว", async () => {
    const resolve = await loadResolver({ sources: [] });

    const ctx = resolve("6043757");

    expect(ctx.cusgroup).toBe("99");
    expect(ctx.region).toBe("SOUTH");
    expect(ctx.vdaCode).toBeUndefined();
  });
});
