import { describe, expect, it, vi } from "vitest";
import type { SalesSession } from "@/lib/auth/sales-session";

/**
 * มุมมองทดสอบเซลล์ของ creator = ดูได้อย่างเดียว (QA 28 ก.ย. 69 P1-5)
 * เดิมเขียนได้ทุกอย่างและบันทึกเป็นอีเมลของเซลล์ที่ถูกทดสอบ
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

describe("applySalesPreview + salesPreviewReadOnly", () => {
  it("creator ในมุมมองทดสอบ → session ติด previewBy (อีเมลจริง) และเขียนไม่ได้ (403)", async () => {
    const { applySalesPreview } = await import("@/lib/auth/sales-preview");
    const { salesPreviewReadOnly } = await import("@/lib/auth/sales-session");
    const s = applySalesPreview(creator, preview);
    expect(s.email).toBe("sales@x");
    expect(s.previewBy).toBe("dev@x");
    expect(s.manualCodes).toEqual(["S555"]);
    const res = salesPreviewReadOnly(s);
    expect(res?.status).toBe(403);
  });

  it("ไม่ได้อยู่ในมุมมองทดสอบ → เขียนได้", async () => {
    const { salesPreviewReadOnly } = await import("@/lib/auth/sales-session");
    expect(salesPreviewReadOnly(creator)).toBeNull();
    expect(salesPreviewReadOnly({ email: "s@x", role: "sales", salesmanCode: "S1" })).toBeNull();
    expect(salesPreviewReadOnly(null)).toBeNull();
  });

  it("เซลล์ที่มี cookie มุมมองทดสอบค้าง (ไม่ใช่ creator) → ไม่ถูกสวม และไม่ถูกบล็อก", async () => {
    const { applySalesPreview } = await import("@/lib/auth/sales-preview");
    const { salesPreviewReadOnly } = await import("@/lib/auth/sales-session");
    const sales: SalesSession = { email: "s@x", role: "sales", salesmanCode: "S1" };
    const s = applySalesPreview(sales, preview);
    expect(s).toBe(sales);
    expect(salesPreviewReadOnly(s)).toBeNull();
  });

  it("previewBy อ่านจาก cookie ที่เซ็นไม่ได้ — verifySalesSessionToken ไม่ประกอบฟิลด์นี้กลับ", async () => {
    const { signSalesSession, verifySalesSessionToken } = await import("@/lib/auth/sales-session");
    const forged = signSalesSession({ email: "s@x", role: "sales", previewBy: "x" } as SalesSession);
    expect(verifySalesSessionToken(forged)?.previewBy).toBeUndefined();
  });
});
