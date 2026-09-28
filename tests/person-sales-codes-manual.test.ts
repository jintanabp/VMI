import { describe, expect, it, vi } from "vitest";

/**
 * ตั้งแต่ 28 ก.ย. 2569 รหัส ↔ อีเมล มาจากที่แอดมินผูกไว้ (SalesmanEmailAssignment) เท่านั้น —
 * ไม่มีการจับคู่อัตโนมัติจาก cross_salesman master แล้ว (รหัส SXXX ที่ใช้จริงไม่มีในไฟล์นั้น)
 */

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

describe("buildVdaSalesDirectory — อีเมลที่ผูกไว้เป็นแหล่งเดียวของรหัส ↔ อีเมล", () => {
  it("อีเมลที่ผูกกับรหัส → อยู่ในรายชื่อพร้อม VDA ของรหัสนั้น · รหัสที่ยังไม่มีใครผูก → unmapped", async () => {
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
    expect(dir.people.find((p) => p.email === "__unmapped__:S555")?.unmapped).toBe(true);
    // S001 เคยมีเจ้าของจาก master — ตอนนี้ไม่มีใครผูก จึงเป็น unmapped เหมือนรหัสอื่น
    expect(dir.people.find((p) => p.email === "__unmapped__:S001")?.unmapped).toBe(true);
    const vda1 = dir.vdas.find((v) => v.vda === "vda1")!;
    expect(vda1.people.map((p) => p.email).sort()).toEqual(["a@sahapat.co.th", "b@sahapat.co.th"]);
  });

  it("อีเมลที่ผูกกับรหัสที่ยังไม่มีคลัง/ไม่อยู่ในทะเบียน VDA → ยังอยู่ในรายชื่อ (หน้าทดสอบมุมมองเซลล์กดได้)", async () => {
    const { buildVdaSalesDirectory } = await import("@/lib/admin/vda-sales-directory");
    const dir = buildVdaSalesDirectory([{ email: "new@sahapat.co.th", salesmanCode: "S777" }]);
    const p = dir.people.find((x) => x.email === "new@sahapat.co.th");
    expect(p?.codes.map((c) => c.code)).toEqual(["S777"]);
    expect(p?.hasVdaAccess).toBe(false);
    expect(dir.codes.find((c) => c.code === "S777")?.manual.map((m) => m.email)).toEqual([
      "new@sahapat.co.th",
    ]);
  });
});

describe("getPersonSalesCodes — ใช้เฉพาะรหัสที่ผูกกับอีเมล", () => {
  it("ไม่ได้ผูก → ไม่มีรหัส (ไม่มี fallback ไป master)", async () => {
    const { getPersonSalesCodes } = await import("@/lib/admin/vda-sales-directory");
    expect(getPersonSalesCodes("x@sahapat.co.th")).toEqual([]);
    expect(getPersonSalesCodes("x@sahapat.co.th", [])).toEqual([]);
  });

  it("ผูกไว้ → รหัสที่ผูก + VDA จากทะเบียน · ชื่อเป็น 'รหัส SXXX'", async () => {
    const { getPersonSalesCodes } = await import("@/lib/admin/vda-sales-directory");
    const codes = getPersonSalesCodes("x@sahapat.co.th", ["s091", "S091"]);
    expect(codes.map((c) => c.code)).toEqual(["S091"]);
    expect(codes[0]!.vdas).toEqual(["vda1", "vda3"]);
    expect(codes[0]!.name).toBe("รหัส S091");
  });

  it("resolveAllPersonVdaCodes ใช้ชุดเดียวกัน", async () => {
    const { resolveAllPersonVdaCodes } = await import("@/lib/orders/access");
    expect(resolveAllPersonVdaCodes("x@sahapat.co.th")).toEqual([]);
    expect(resolveAllPersonVdaCodes("x@sahapat.co.th", ["S091", "S555"])).toEqual([
      "vda1",
      "vda3",
      "vda4",
    ]);
  });

  it("pickPrimaryCode — รหัสที่ดูแลคลังมาก่อน", async () => {
    const { pickPrimaryCode } = await import("@/lib/admin/vda-sales-directory");
    expect(pickPrimaryCode(["S777", "S555"])).toBe("S555");
    expect(pickPrimaryCode(["S900", "S777"])).toBe("S777");
    expect(pickPrimaryCode([])).toBeUndefined();
  });
});
