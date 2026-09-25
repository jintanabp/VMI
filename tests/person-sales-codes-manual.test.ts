import { describe, expect, it, vi } from "vitest";

/**
 * รหัสที่แอดมินกำหนด "แทนที่" รหัสอัตโนมัติ ไม่ใช่เพิ่มเข้าไป — เดิมปุ่ม "ดูทุก VDA ของฉัน" /
 * ตัวสลับรหัส / สิทธิ์ดูออเดอร์ ยังดึงรหัสจาก cross_salesman ตามอีเมลมารวมด้วย
 */

vi.mock("@/lib/fabric", () => ({
  getSalesmanRegistry: () => ({
    // cross_salesman จับอีเมลนี้กับ S001 อัตโนมัติ
    getAssignmentsByEmail: () => [{ code: "S001", email: "x@sahapat.co.th" }],
    getCurrentByCode: (code: string) =>
      code === "S091" ? { code: "S091" } : code === "S001" ? { code: "S001", email: "x@sahapat.co.th" } : null,
    listCurrentAssignments: () => [{ code: "S001", email: "x@sahapat.co.th" }],
    isLoaded: true,
    getDisplayName: (a: { code: string }) => `ชื่อ ${a.code}`,
  }),
}));

vi.mock("@/lib/fabric/vda-aos-bill", () => ({
  getVdaAosBillRegistry: () => ({
    getVdasForSalesman: (code: string) =>
      code === "S001" ? ["vda9"] : code === "S091" ? ["vda1", "vda3"] : code === "S555" ? ["vda4"] : [],
    isLoaded: true,
    listVdaCodes: () => ["vda1", "vda4", "vda9"],
    getSalesmanCodesForVda: (vda: string) =>
      vda === "vda1" ? ["S091"] : vda === "vda4" ? ["S555"] : vda === "vda9" ? ["S001"] : [],
  }),
  getVdaKeys: () => [],
  isVdaStoreCode: () => true,
}));

describe("buildVdaSalesDirectory — อีเมลที่แอดมินกำหนดเป็นอีเมลอ้างอิงของรหัส", () => {
  it("รหัสที่ไม่มีเจ้าของใน cross_salesman แต่แอดมินกำหนดอีเมลไว้ → แสดงเป็นอีเมลนั้น ไม่ใช่ unmapped", async () => {
    const { buildVdaSalesDirectory } = await import("@/lib/admin/vda-sales-directory");
    const dir = buildVdaSalesDirectory([
      { email: "a@sahapat.co.th", salesmanCode: "S091" },
      { email: "b@sahapat.co.th", salesmanCode: "s091" },
    ]);
    const emails = dir.people.map((p) => p.email);
    expect(emails).toContain("a@sahapat.co.th");
    expect(emails).toContain("b@sahapat.co.th");
    expect(emails).not.toContain("__unmapped__:S091");
    const a = dir.people.find((p) => p.email === "a@sahapat.co.th")!;
    expect(a.unmapped).toBeFalsy();
    expect(a.allVdas).toEqual(["vda1", "vda3"]);
    // รหัสที่ยังไม่มีอีเมลเลย → ยังแสดง แต่ติดป้าย "ยังไม่กำหนดอีเมล"
    expect(dir.people.find((p) => p.email === "__unmapped__:S555")?.unmapped).toBe(true);
    const vda1 = dir.vdas.find((v) => v.vda === "vda1")!;
    expect(vda1.people.map((p) => p.email).sort()).toEqual(["a@sahapat.co.th", "b@sahapat.co.th"]);
  });
});

describe("getPersonSalesCodes — รหัสที่แอดมินกำหนดแทนที่รหัสอัตโนมัติ", () => {
  it("ไม่มีการกำหนด → ใช้รหัสอัตโนมัติจากอีเมล", async () => {
    const { getPersonSalesCodes } = await import("@/lib/admin/vda-sales-directory");
    expect(getPersonSalesCodes("x@sahapat.co.th").map((c) => c.code)).toEqual(["S001"]);
  });

  it("มีการกำหนด → ใช้เฉพาะรหัสที่กำหนด ไม่รวม S001 อัตโนมัติ", async () => {
    const { getPersonSalesCodes } = await import("@/lib/admin/vda-sales-directory");
    const codes = getPersonSalesCodes("x@sahapat.co.th", ["s091"]);
    expect(codes.map((c) => c.code)).toEqual(["S091"]);
    expect(codes[0]!.vdas).toEqual(["vda1", "vda3"]);
    expect(codes[0]!.name).toBe("ชื่อ S091");
  });

  it("resolveAllPersonVdaCodes ใช้ชุดเดียวกัน — ไม่เห็น vda9 ของรหัสอัตโนมัติ", async () => {
    const { resolveAllPersonVdaCodes } = await import("@/lib/orders/access");
    expect(resolveAllPersonVdaCodes("x@sahapat.co.th")).toEqual(["vda9"]);
    expect(resolveAllPersonVdaCodes("x@sahapat.co.th", ["S091"])).toEqual(["vda1", "vda3"]);
  });
});
