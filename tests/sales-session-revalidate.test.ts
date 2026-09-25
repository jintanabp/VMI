import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesSession } from "@/lib/auth/sales-session";

/**
 * แอดมินเอาอีเมลออกจากรหัสเซลล์ → คนที่ login ค้างอยู่ต้องเสียสิทธิ์ทันที ไม่ใช่รอ cookie หมดอายุ 7 วัน
 *
 * mock ตารางที่แอดมินกำหนด + master พนักงาน (ว่าง) — ตรวจแค่การตัดสินใจของ revalidateManualCodes
 */

let manualCodes: string[] | Error = [];

vi.mock("@/lib/auth/manual-salesman-assignments", () => ({
  getManualSalesmanCodes: async () => {
    if (manualCodes instanceof Error) throw manualCodes;
    return manualCodes;
  },
}));

vi.mock("@/lib/fabric", () => ({
  getSalesmanRegistry: () => ({
    getCurrentByEmail: () => null,
    getCurrentByCode: () => null,
    listCurrentAssignments: () => [],
    getDisplayName: () => "",
  }),
}));

vi.mock("@/lib/admin/vda-sales-directory", () => ({
  pickDefaultSalesmanAssignment: () => null,
  pickAssignmentForCodes: () => null,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const base: SalesSession = {
  email: "helper@sahapat.co.th",
  role: "sales",
  salesmanCode: "S091",
  scopeSalesmanCodes: ["S091"],
  manualCodes: ["S091"],
};

describe("revalidateManualCodes — สิทธิ์ตามการกำหนดของแอดมินตอนนี้ ไม่ใช่ตอน login", () => {
  let revalidate: typeof import("@/lib/auth/sales-session").revalidateManualCodes;

  beforeEach(async () => {
    ({ revalidateManualCodes: revalidate } = await import("@/lib/auth/sales-session"));
  });

  it("รหัสยังตรงกับที่ติดมาใน session → ใช้ session เดิม", async () => {
    manualCodes = ["S091"];
    expect(await revalidate(base)).toBe(base);
  });

  it("แอดมินเอาอีเมลออก และไม่มีรหัสใน master แล้ว → ไม่มี session (ถูกพาไป login)", async () => {
    manualCodes = [];
    expect(await revalidate(base)).toBeNull();
  });

  it("ฐานข้อมูลอ่านไม่ได้ชั่วคราว → ใช้สิทธิ์เดิมไปก่อน ไม่เตะทุกคนออก", async () => {
    manualCodes = new Error("db down");
    expect(await revalidate(base)).toBe(base);
  });

  it("แอดมินกำหนดรหัสที่ไม่มีใน cross_salesman → ยังเข้าใช้งานได้ในฐานะรหัสนั้น (อีเมลอ้างอิง)", async () => {
    manualCodes = ["S777"];
    const { buildSalesSessionWithAccess } = await import("@/lib/auth/sales-session");
    const s = await buildSalesSessionWithAccess("ref@sahapat.co.th", "ผู้ใช้อ้างอิง");
    expect(s.role).toBe("sales");
    expect(s.salesmanCode).toBe("S777");
    expect(s.scopeSalesmanCodes).toEqual(["S777"]);
    expect(s.manualCodes).toEqual(["S777"]);
    expect(s.name).toBe("ผู้ใช้อ้างอิง");
  });

  it("session เก่าที่ไม่มีฟิลด์ manualCodes และไม่มีการกำหนด → ใช้ session เดิม", async () => {
    manualCodes = [];
    const old = { ...base, manualCodes: undefined };
    expect(await revalidate(old)).toBe(old);
  });
});
