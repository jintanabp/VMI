import { describe, expect, it } from "vitest";
import { legacySiteAllowed, movedTargetUrl } from "@/lib/moved";

/** ระบบย้ายแล้ว: ผู้ดูแลระบบยังเข้าระบบเก่าได้ คนอื่นเห็นหน้าแจ้งย้าย (2 พ.ย. 69) */
describe("legacySiteAllowed", () => {
  it("creator / admin login อยู่ → เปิดหน้าเดิมได้ ไม่ต้องมี cookie", () => {
    expect(legacySiteAllowed({ isAdmin: true, hasLegacyCookie: false, hasAnySession: true })).toBe(true);
  });

  it("กดลิงก์ผู้ดูแลระบบแล้ว ยังไม่ได้ login → เปิดหน้า login ได้", () => {
    expect(legacySiteAllowed({ isAdmin: false, hasLegacyCookie: true, hasAnySession: false })).toBe(true);
  });

  it("ร้าน/เซลล์ที่กดลิงก์ผู้ดูแลระบบแล้ว login → cookie ไม่ให้สิทธิ์ กลับไปหน้าแจ้งย้าย", () => {
    expect(legacySiteAllowed({ isAdmin: false, hasLegacyCookie: true, hasAnySession: true })).toBe(false);
  });

  it("คนทั่วไป → หน้าแจ้งย้าย", () => {
    expect(legacySiteAllowed({ isAdmin: false, hasLegacyCookie: false, hasAnySession: false })).toBe(false);
    expect(legacySiteAllowed({ isAdmin: false, hasLegacyCookie: false, hasAnySession: true })).toBe(false);
  });
});

describe("movedTargetUrl — ปุ่มพาไปหน้าเดียวกันบนเว็บใหม่ (3 พ.ย. 69)", () => {
  const to = "https://saai.sahapat.com/vda/";
  it("เก็บ path และ query ไว้", () => {
    expect(movedTargetUrl(to, "/vmi", "/vmi/sales/orders/", "?page=2")).toBe(
      "https://saai.sahapat.com/vda/sales/orders/?page=2"
    );
    expect(movedTargetUrl(to, "/vmi", "/vmi/stock/")).toBe("https://saai.sahapat.com/vda/stock/");
  });

  it("หน้าแรก / ไม่อยู่ใต้ basePath → หน้าแรกเว็บใหม่", () => {
    expect(movedTargetUrl(to, "/vmi", "/vmi/")).toBe(to);
    expect(movedTargetUrl(to, "/vmi", "/vmi")).toBe(to);
    expect(movedTargetUrl(to, "/vmi", "/vmicenter/x")).toBe(to);
    expect(movedTargetUrl("https://saai.sahapat.com/vda", "/vmi", "/vmi/history/")).toBe(
      "https://saai.sahapat.com/vda/history/"
    );
  });
});
