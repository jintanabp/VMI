import { describe, expect, it, vi } from "vitest";
import type { SalesSession } from "@/lib/auth/sales-session";

/**
 * มุมมองทดสอบเซลล์ของ creator = ทำได้ทุกอย่าง แต่บันทึกผู้ทำเป็นอีเมล creator (19 ต.ค. 69)
 * ปัญหาเดิม (QA 28 ก.ย. 69 P1-5) คือบันทึกเป็นอีเมลของเซลล์ที่ถูกทดสอบ จึงเคยปิดเป็นดูอย่างเดียว
 */

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/admin-registry", () => ({
  isCreatorEmail: () => false,
  isAdminEmail: () => false,
  isAdminEmailAsync: async () => false,
  parseAdminEmailsFromEnv: () => [],
}));
vi.mock("@/lib/auth/manual-salesman-assignments", () => ({
  getManualSalesmanCodes: async () => [],
}));

const creator: SalesSession = { email: "dev@x", role: "admin", adminAccess: "creator" };
const preview = {
  asEmail: "sales@x",
  asCode: "S555",
  asName: "รหัส S555",
  exp: Date.now() + 60_000,
};

describe("applySalesPreview + salesActorEmail", () => {
  it("creator ในมุมมองทดสอบ → เห็นแบบเซลล์ แต่บันทึกผู้ทำเป็นอีเมล creator", async () => {
    const { applySalesPreview } = await import("@/lib/auth/sales-preview");
    const { salesActorEmail } = await import("@/lib/auth/sales-session");
    const s = applySalesPreview(creator, preview);
    expect(s.email).toBe("sales@x");
    expect(s.previewBy).toBe("dev@x");
    expect(s.manualCodes).toEqual(["S555"]);
    expect(salesActorEmail(s)).toBe("dev@x");
  });

  it("ไม่ได้อยู่ในมุมมองทดสอบ → ผู้ทำคืออีเมลของตัวเอง", async () => {
    const { salesActorEmail } = await import("@/lib/auth/sales-session");
    expect(salesActorEmail(creator)).toBe("dev@x");
    expect(salesActorEmail({ email: "s@x", role: "sales", salesmanCode: "S1" })).toBe("s@x");
  });

  it("เซลล์ที่มี cookie มุมมองทดสอบค้าง (ไม่ใช่ creator) → ไม่ถูกสวม", async () => {
    const { applySalesPreview } = await import("@/lib/auth/sales-preview");
    const { salesActorEmail } = await import("@/lib/auth/sales-session");
    const sales: SalesSession = { email: "s@x", role: "sales", salesmanCode: "S1" };
    const s = applySalesPreview(sales, preview);
    expect(s).toBe(sales);
    expect(salesActorEmail(s)).toBe("s@x");
  });

  it("previewBy อ่านจาก cookie ที่เซ็นไม่ได้ — verifySalesSessionToken ไม่ประกอบฟิลด์นี้กลับ", async () => {
    const { signSalesSession, verifySalesSessionToken } = await import("@/lib/auth/sales-session");
    const forged = signSalesSession({ email: "s@x", role: "sales", previewBy: "x" } as SalesSession);
    expect(verifySalesSessionToken(forged)?.previewBy).toBeUndefined();
  });
});
