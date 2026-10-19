import { describe, expect, it } from "vitest";
import {
  checkManualPoStatusChange,
  isErpSendStuck,
  poMayBeInErp,
  SENDING_TO_ERP,
} from "@/lib/po/po-status";

/**
 * เปลี่ยนสถานะ PO ด้วยมือ (QA 28 ก.ย. 69): ตั้ง "เข้า ERP แล้ว" เองได้ · ยกเลิกใบที่อยู่ใน ERP ได้ ·
 * ย้ายกลับจากยกเลิกแล้วร้านไม่รู้
 */
describe("checkManualPoStatusChange", () => {
  it("สถานะ ERP ตั้งเองไม่ได้ (400) — ต้องมาจาก send-erp เท่านั้น", () => {
    for (const to of ["sent_erp", "sending_erp", "erp_unknown"] as const) {
      const v = checkManualPoStatusChange({ from: "issued", to, mayBeInErp: false });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.httpStatus).toBe(400);
    }
  });

  it("ใบที่อาจอยู่ใน ERP แล้ว ยกเลิกไม่ได้ (409) และบอกให้ไปยกเลิกใน ERP ก่อน", () => {
    const v = checkManualPoStatusChange({ from: "sent_erp", to: "cancelled", mayBeInErp: true });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.httpStatus).toBe(409);
      expect(v.error).toContain("ยกเลิกในระบบ ERP ก่อน");
    }
  });

  it("ใบที่อาจอยู่ใน ERP แล้ว ถอยกลับเป็นออกแล้ว/ส่งซัพไม่ได้ แต่ตั้ง 'รับของแล้ว' ได้", () => {
    for (const to of ["issued", "sent"] as const) {
      const v = checkManualPoStatusChange({ from: "sent_erp", to, mayBeInErp: true });
      expect(v.ok).toBe(false);
    }
    expect(
      checkManualPoStatusChange({ from: "sent_erp", to: "received", mayBeInErp: true }).ok
    ).toBe(true);
  });

  it("ERP ไม่ตอบ (erp_unknown) ยกเลิก/ถอยกลับไม่ได้ ได้แค่ รับของแล้ว", () => {
    for (const to of ["issued", "sent", "cancelled"] as const) {
      expect(
        checkManualPoStatusChange({ from: "erp_unknown", to, mayBeInErp: true }).ok
      ).toBe(false);
    }
    expect(
      checkManualPoStatusChange({ from: "erp_unknown", to: "received", mayBeInErp: true }).ok
    ).toBe(true);
  });

  it("กำลังส่ง ERP อยู่ เปลี่ยนสถานะไม่ได้", () => {
    const v = checkManualPoStatusChange({ from: "sending_erp", to: "cancelled", mayBeInErp: false });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.httpStatus).toBe(409);
  });

  it("ใบที่ยังไม่เข้า ERP ยกเลิกได้ตามปกติ", () => {
    expect(
      checkManualPoStatusChange({ from: "issued", to: "cancelled", mayBeInErp: false })
    ).toEqual({ ok: true, reopened: false });
  });

  it("ย้ายกลับจากยกเลิก = reopened (route ใช้แจ้งร้าน)", () => {
    expect(
      checkManualPoStatusChange({ from: "cancelled", to: "issued", mayBeInErp: false })
    ).toEqual({ ok: true, reopened: true });
    expect(
      checkManualPoStatusChange({ from: "cancelled", to: "cancelled", mayBeInErp: false })
    ).toEqual({ ok: true, reopened: false });
  });
});

describe("isErpSendStuck / poMayBeInErp กับสถานะกำลังส่ง (19 ต.ค. 69)", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60 * 1000);

  it("กำลังส่งเกิน 10 นาที = ค้าง · ไม่ถึง = กำลังยิงอยู่ · ไม่รู้เวลาเริ่ม = ไม่นับว่าค้าง", () => {
    expect(isErpSendStuck({ status: SENDING_TO_ERP, statusAt: ago(10) }, now)).toBe(true);
    expect(isErpSendStuck({ status: SENDING_TO_ERP, statusAt: ago(9) }, now)).toBe(false);
    expect(isErpSendStuck({ status: SENDING_TO_ERP, statusAt: null }, now)).toBe(false);
    expect(isErpSendStuck({ status: "issued", statusAt: ago(60) }, now)).toBe(false);
  });

  it("ใบที่กำลังส่ง/ค้างกลางการยิง ถือว่าอาจอยู่ใน ERP แล้ว (ห้ามลบ/ยกเลิก)", () => {
    expect(poMayBeInErp({ erpSentAt: null, status: SENDING_TO_ERP })).toBe(true);
    expect(poMayBeInErp({ erpSentAt: null, status: "issued" })).toBe(false);
  });
});
