import { describe, expect, it, vi } from "vitest";

/**
 * รหัสที่แอดมินกำหนด "แทนที่" รหัสอัตโนมัติ ไม่ใช่เพิ่มเข้าไป — เดิมปุ่ม "ดูทุก VDA ของฉัน" /
 * ตัวสลับรหัส / สิทธิ์ดูออเดอร์ ยังดึงรหัสจาก cross_salesman ตามอีเมลมารวมด้วย
 */

vi.mock("@/lib/fabric", () => ({
  getSalesmanRegistry: () => ({
    // cross_salesman จับอีเมลนี้กับ S001 อัตโนมัติ
    getAssignmentsByEmail: () => [{ code: "S001", email: "x@sahapat.co.th" }],
    getCurrentByCode: (code: string) => (code === "S091" ? { code: "S091" } : null),
    getDisplayName: (a: { code: string }) => `ชื่อ ${a.code}`,
  }),
}));

vi.mock("@/lib/fabric/vda-aos-bill", () => ({
  getVdaAosBillRegistry: () => ({
    getVdasForSalesman: (code: string) =>
      code === "S001" ? ["vda9"] : code === "S091" ? ["vda1", "vda3"] : [],
  }),
  getVdaKeys: () => [],
  isVdaStoreCode: () => true,
}));

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
