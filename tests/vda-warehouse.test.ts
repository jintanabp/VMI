import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ทะเบียนคลัง VDA — ฐานข้อมูลต้องชนะ .env เสมอ
 *
 * ถ้า env ชนะ แอดมินที่แก้ทะเบียนจากหน้าเว็บจะโดนค่าเก่าใน .env ทับเงียบ ๆ ตอน restart
 * ซึ่งเป็นกับดักตัวเดียวกับที่ทำให้โปร C4 ผิดอยู่สองวัน (CFT_ONELAKE_PATH ใน .env
 * ชนะค่าที่ถูกต้องในโค้ด โดยไม่มีอะไรบนหน้าจอบอกว่ามันชนะอยู่)
 */

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  return import("@/lib/fabric/vda-warehouse-registry");
}

describe("ทะเบียนคลัง VDA", () => {
  it("อ่านจาก .env ได้เมื่อฐานข้อมูลยังว่าง (deploy ครั้งแรก)", async () => {
    vi.stubEnv("VDA_CUSTOMER_MAP", "vda1:3231847,vda2:5042814|5042815");
    const { mergeVdaWarehouses } = await load();

    const rows = mergeVdaWarehouses([]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      code: "vda1",
      customerCodes: ["3231847"],
      source: "env",
      active: true,
    });
    expect(rows[1].customerCodes).toEqual(["5042814", "5042815"]);
  });

  it("แถวในฐานข้อมูลทับค่าใน .env ที่รหัสคลังเดียวกัน", async () => {
    vi.stubEnv("VDA_CUSTOMER_MAP", "vda1:3231847");
    const { mergeVdaWarehouses } = await load();

    const rows = mergeVdaWarehouses([
      { code: "vda1", customerCodes: "9999999", label: "คลังใหม่", active: true },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "vda1",
      customerCodes: ["9999999"],
      label: "คลังใหม่",
      source: "db",
    });
  });

  it("คลังที่แอดมินเพิ่มใหม่ (ไม่มีใน .env) ก็อยู่ในทะเบียน", async () => {
    vi.stubEnv("VDA_CUSTOMER_MAP", "vda1:3231847");
    const { mergeVdaWarehouses } = await load();

    const rows = mergeVdaWarehouses([
      { code: "VDA_6", customerCodes: "1234567", label: "", active: true },
    ]);

    expect(rows.map((r) => r.code)).toEqual(["vda1", "vda6"]);
  });

  it("ปิดใช้งานคลังได้โดยไม่ต้องลบทิ้ง", async () => {
    vi.stubEnv("VDA_CUSTOMER_MAP", "");
    const { mergeVdaWarehouses } = await load();

    const rows = mergeVdaWarehouses([
      { code: "vda4", customerCodes: "3184635", label: "", active: false },
    ]);

    expect(rows[0].active).toBe(false);
  });
});

describe("getVdaKeys", () => {
  async function loadKeys(opts: {
    warehouses?: { code: string; active: boolean }[];
    stockSources?: string[];
    envCodes?: string;
  }) {
    vi.doMock("@/lib/fabric/vda-warehouse-registry", () => ({
      listVdaWarehouses: () =>
        (opts.warehouses ?? []).map((w) => ({
          code: w.code,
          customerCodes: ["1"],
          label: "",
          active: w.active,
          source: "db" as const,
        })),
    }));
    vi.doMock("@/lib/fabric/stock-cover", () => ({
      fabricStockReady: () => (opts.stockSources ?? []).length > 0,
      getStockCoverDirectory: () => ({
        resolveSources: () => opts.stockSources ?? [],
      }),
    }));
    vi.doMock("@/lib/fabric/stock-filter-config", () => ({
      getStockFilterConfig: () => ({}),
    }));
    vi.doMock("@/lib/fabric/cross-target", () => ({
      getCrossTargetRegistry: () => ({ rowsFor: () => [] }),
    }));
    if (opts.envCodes !== undefined) vi.stubEnv("VDA_CODES", opts.envCodes);
    const mod = await import("@/lib/fabric/vda-aos-bill");
    return mod.getVdaKeys();
  }

  it("นับคลังใหม่ที่โผล่ในไฟล์สต็อก โดยไม่ต้องแก้ env", async () => {
    const keys = await loadKeys({ stockSources: ["vda1", "vda6", "vda7"] });

    expect(keys).toContain("vda6");
    expect(keys).toContain("vda7");
  });

  it("นับคลังที่แอดมินเพิ่งเพิ่มในทะเบียน แม้ยังไม่มีข้อมูลสต็อก", async () => {
    const keys = await loadKeys({
      warehouses: [{ code: "vda9", active: true }],
    });

    expect(keys).toContain("vda9");
  });

  it("คลังที่ปิดใช้งานไม่ถูกนับ", async () => {
    const keys = await loadKeys({
      warehouses: [{ code: "vda9", active: false }],
    });

    expect(keys).not.toContain("vda9");
  });

  it("VDA_CODES ยัง override ได้เป๊ะ ๆ เมื่อจำเป็น", async () => {
    const keys = await loadKeys({
      envCodes: "vda1,vda2",
      stockSources: ["vda1", "vda2", "vda6"],
    });

    expect(keys).toEqual(["vda1", "vda2"]);
  });
});
