import { describe, expect, it } from "vitest";
import { auditActionLabel, formatAuditDetail } from "@/lib/admin/audit-log-labels";

describe("formatAuditDetail", () => {
  it("แปลงคีย์เป็นป้ายไทย และค่าจริง/เท็จ/ว่าง เป็นคำที่อ่านออก", () => {
    expect(
      formatAuditDetail(
        JSON.stringify({ salesmanCode: "S091", notifyStore: true, vdaCode: null, poNumbers: ["V1", "V2"] })
      )
    ).toBe("รหัสเซลล์: S091 · แจ้งร้าน: ใช่ · VDA: — · PO: V1, V2");
  });

  it("detail ว่าง = ข้อความว่าง · อ่าน JSON ไม่ออก = โชว์ดิบ", () => {
    expect(formatAuditDetail("")).toBe("");
    expect(formatAuditDetail("{broken")).toBe("{broken");
  });

  it("action ที่ไม่รู้จักโชว์ชื่อดิบ ไม่พัง", () => {
    expect(auditActionLabel("store.approve")).toBe("อนุมัติบัญชีร้านค้า");
    expect(auditActionLabel("x.y")).toBe("x.y");
  });
});
