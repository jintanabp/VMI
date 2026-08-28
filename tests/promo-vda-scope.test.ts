import { describe, expect, it } from "vitest";
import {
  pickPromoStoreCodes,
  resolvePromoVdaScope,
  type PromoScope,
} from "@/lib/promo/promo-vda-scope";
import type { SalesSession } from "@/lib/auth/sales-session";

/**
 * โปรผูกกับบริบทของแต่ละคลัง และ region ต่างกันได้จริง — คลังคนละภาคเห็นโปรคนละชุด
 * ถ้ากติกาสิทธิ์พลาด เซลล์จะเห็นโปรของคลังที่ตัวเองไม่ได้ดูแลแล้วเอาไปแจ้งร้านผิด
 */
const ALL = ["vda1", "vda2", "vda3", "vda4", "vda5"];

const sales = (over: Partial<SalesSession> = {}): SalesSession => ({
  email: "rep@x.com",
  role: "sales",
  ...over,
});

describe("resolvePromoVdaScope", () => {
  it("แอดมินเห็นทุกคลัง", () => {
    const s = resolvePromoVdaScope(sales({ role: "admin" }), ALL, ALL);
    expect(s.kind).toBe("all");
    expect(s.kind !== "none" && s.storeCodes).toEqual(ALL);
  });

  it("เซลล์เห็นเฉพาะคลังที่ดูแล", () => {
    const s = resolvePromoVdaScope(sales(), ALL, ["vda2", "vda4"]);
    expect(s.kind).toBe("scoped");
    expect(s.kind !== "none" && s.storeCodes).toEqual(["vda2", "vda4"]);
  });

  it("เซลล์ที่ไม่มีคลังในความดูแล = ไม่มีสิทธิ์ดูอะไรเลย", () => {
    expect(resolvePromoVdaScope(sales(), ALL, []).kind).toBe("none");
  });

  it("ยังไม่ล็อกอิน = ไม่มีสิทธิ์", () => {
    expect(resolvePromoVdaScope(null, ALL, ALL).kind).toBe("none");
  });

  it("คลังที่ถือสิทธิ์อยู่แต่ไม่มีในระบบแล้ว จะไม่โผล่มา", () => {
    // ทะเบียนบอกว่าดูแล vda9 แต่ vda9 ไม่มีใน stock cover แล้ว
    const s = resolvePromoVdaScope(sales(), ALL, ["vda2", "vda9"]);
    expect(s.kind !== "none" && s.storeCodes).toEqual(["vda2"]);
  });

  it("เทียบรหัสแบบไม่สนตัวพิมพ์", () => {
    const s = resolvePromoVdaScope(sales(), ALL, ["VDA3"]);
    expect(s.kind !== "none" && s.storeCodes).toEqual(["vda3"]);
  });
});

describe("pickPromoStoreCodes", () => {
  const adminScope: PromoScope = { kind: "all", storeCodes: ALL };
  const repScope: PromoScope = { kind: "scoped", storeCodes: ["vda2", "vda4"] };

  it("ไม่ระบุคลัง = ทุกคลังที่มีสิทธิ์", () => {
    expect(pickPromoStoreCodes(repScope, null)).toEqual(["vda2", "vda4"]);
    expect(pickPromoStoreCodes(repScope, "all")).toEqual(["vda2", "vda4"]);
  });

  it("เลือกคลังที่มีสิทธิ์ = ได้เฉพาะคลังนั้น", () => {
    expect(pickPromoStoreCodes(repScope, "vda4")).toEqual(["vda4"]);
  });

  it("**เซลล์ขอคลังที่ไม่ได้ดูแล = ปฏิเสธ (null) ไม่ใช่คืนว่าง**", () => {
    // คืนว่างจะทำให้หน้าจอขึ้นว่า "คลังนี้ไม่มีโปร" ซึ่งเป็นคนละเรื่องกับ "ห้ามดู"
    expect(pickPromoStoreCodes(repScope, "vda1")).toBeNull();
    expect(pickPromoStoreCodes(repScope, "vda5")).toBeNull();
  });

  it("แอดมินขอคลังไหนก็ได้", () => {
    expect(pickPromoStoreCodes(adminScope, "vda1")).toEqual(["vda1"]);
    expect(pickPromoStoreCodes(adminScope, "vda5")).toEqual(["vda5"]);
  });

  it("แอดมินขอคลังที่ไม่มีจริง = ปฏิเสธ", () => {
    expect(pickPromoStoreCodes(adminScope, "vda99")).toBeNull();
  });

  it("ไม่มีคลังในความดูแล = ว่าง (ไม่ใช่ปฏิเสธ)", () => {
    expect(pickPromoStoreCodes({ kind: "none" }, "vda1")).toEqual([]);
  });

  it("ตัวพิมพ์ใหญ่/ช่องว่างไม่ทำให้หลุดสิทธิ์", () => {
    expect(pickPromoStoreCodes(repScope, " VDA2 ")).toEqual(["vda2"]);
    expect(pickPromoStoreCodes(repScope, " VDA1 ")).toBeNull();
  });
});
