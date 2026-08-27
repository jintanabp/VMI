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
  /** บริบทที่ "ไฟล์ที่โหลดอยู่" มี — undefined = ยังไม่โหลดไฟล์โปร */
  fileContexts?: { division: string; cusgroup: string }[];
}) {
  vi.doMock("@/lib/fabric", () => ({
    fabricMastersReady: () => opts.mastersReady ?? true,
    fabricPromoReady: () => opts.fileContexts != null,
    getPromotionCreditDirectory: () => ({
      contexts: () => opts.fileContexts ?? [],
    }),
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

    // ห้ามเป็น 99 ที่มาจาก dim_customer — ไฟล์โปรมีแต่ 98 ทั้งไฟล์
    expect(ctx.cusgroup).toBe("98");
    expect(ctx.division).toBe("E");
    expect(ctx.isVda).toBe(false);
    expect(ctx.vdaCode).toBe("vda1");
    expect(ctx.storeCode).toBe("6043757");
  });

  /**
   * ภาคเป็นคนละแกนกับ division/cusgroup
   *
   * division กับ cusgroup เป็นเงื่อนไขของ "คลัง" (ร้านสั่งผ่านคลังจึงใช้ของคลัง)
   * แต่ภาคเป็นเงื่อนไขของ "พื้นที่ที่ขายของ" จึงต้องมาจากร้าน ไม่ใช่คลัง —
   * ไม่งั้นร้านภาคใต้ที่รับของจากคลัง กทม. จะได้โปรเฉพาะ กทม. ไปด้วย
   */
  it("ภาคมาจากร้านใน dim_customer ไม่ใช่ค่าตายตัว COUNTRY", async () => {
    const resolve = await loadResolver({ sources: ["vda1", "vda4"] });

    expect(resolve("6043757").region).toBe("SOUTH");
  });

  it("C4_DEFAULT_REGION เป็นแค่ตาข่ายรับ ห้ามทับภาคจริงของร้าน", async () => {
    // เคยเป็นค่าที่ทับทุกอย่าง ทำให้แถวโปรเฉพาะภาคไม่มีทางเข้าเกณฑ์เลยทั้งระบบ
    vi.stubEnv("C4_DEFAULT_REGION", "COUNTRY");
    const resolve = await loadResolver({ sources: ["vda1"] });

    expect(resolve("6043757").region).toBe("SOUTH");
  });

  it("หาร้านใน dim_customer ไม่เจอ → ถอยไป COUNTRY (ยังได้โปรทั้งประเทศครบ)", async () => {
    const resolve = await loadResolver({
      sources: ["vda1"],
      mastersReady: false,
    });

    expect(resolve("6043757").region).toBe("COUNTRY");
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

/**
 * บริบทต้องอ่านจากไฟล์ได้เองเมื่อไม่มี env
 *
 * บั๊กที่ต้องกันไม่ให้กลับมา: production ไม่มีบล็อก C4_* ใน .env เลย โค้ดจึงถอยไปใช้
 * ค่าฮาร์ดโค้ด S|99 ซึ่งไม่มีในตาราง cash (มีชุดเดียวคือ E|98) ร้านไม่เห็นโปรแบบเงียบ ๆ
 * ทั้งที่ไฟล์บอกอยู่แล้วว่าตัวเองมีบริบทอะไร — VDA ของเราเป็น division E ทั้งหมด
 * การให้คนมาตั้ง env จึงไม่ได้ให้ทางเลือกอะไร มีแต่ช่องพลาด
 */
describe("resolvePromoContext — เดาบริบทจากไฟล์", () => {
  const CASH = [{ division: "E", cusgroup: "98" }];

  it("ไม่มี env เลย → ใช้บริบทเดียวที่มีในไฟล์", async () => {
    vi.unstubAllEnvs();
    const resolve = await loadResolver({
      sources: ["vda1"],
      fileContexts: CASH,
    });
    expect(resolve("vda1")).toMatchObject({ division: "E", cusgroup: "98" });
  });

  it("ร้านค้าก็ได้บริบทเดียวกับคลัง โดยไม่ต้องมี env", async () => {
    vi.unstubAllEnvs();
    const resolve = await loadResolver({
      sources: ["vda1"],
      fileContexts: CASH,
    });
    expect(resolve("6043757")).toMatchObject({ division: "E", cusgroup: "98" });
  });

  it("env ที่ตั้งไว้ชัดเจนยังชนะไฟล์ — เผื่อวันที่ต้นทางซอยหลายชุดจริง", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("C4_DEFAULT_DIVISION", "B");
    vi.stubEnv("C4_DEFAULT_CUSGROUP", "22");
    const resolve = await loadResolver({
      sources: ["vda1"],
      fileContexts: CASH,
    });
    expect(resolve("vda1")).toMatchObject({ division: "B", cusgroup: "22" });
  });

  it("ไฟล์มีหลายบริบท (ตาราง credit ที่หยิบมาผิดใบ) → เดาไม่ได้ ไม่มั่วเลือกให้", async () => {
    vi.unstubAllEnvs();
    const resolve = await loadResolver({
      sources: ["vda1"],
      fileContexts: [
        { division: "S", cusgroup: "99" },
        { division: "E", cusgroup: "99" },
      ],
    });
    // ถอยไปค่าเดิม ไม่ใช่หยิบชุดแรกมาใช้ — ตอน boot มียามร้องแยกอยู่แล้ว
    expect(resolve("vda1")).toMatchObject({ division: "S", cusgroup: "99" });
  });

  it("ยังไม่ได้โหลดไฟล์โปร → ไม่พังและไม่มั่ว", async () => {
    vi.unstubAllEnvs();
    const resolve = await loadResolver({ sources: ["vda1"] });
    expect(resolve("vda1")).toMatchObject({ division: "S", cusgroup: "99" });
  });
});
