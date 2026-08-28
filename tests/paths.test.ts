import { describe, expect, it } from "vitest";
import { appPath, isPathUnder, normalizePathname } from "@/lib/paths";

/**
 * `usePathname()` คืน path **พร้อม** basePath `/vmi` และ **พร้อม** `/` ปิดท้าย
 * (next.config.ts ตั้ง `basePath` กับ `trailingSlash: true` พร้อมกัน)
 *
 * แถบเมนูฝั่งเซลล์เคยเทียบ `pathname === "/sales/orders"` ตรง ๆ ซึ่งไม่มีวันตรง
 * เพราะค่าจริงคือ `/vmi/sales/orders/` ผลคือไม่มีแท็บไหนไฮไลต์เลยสักหน้า
 * และไม่มีอะไรพังให้เห็น จึงไม่มีใครสังเกต — เทสต์ชุดนี้กันไม่ให้ย้อนกลับไปแบบนั้น
 */
describe("normalizePathname", () => {
  it("ตัด basePath และ trailing slash ออก", () => {
    expect(normalizePathname("/vmi/sales/orders/")).toBe("/sales/orders");
    expect(normalizePathname("/vmi/sales/orders")).toBe("/sales/orders");
  });

  it("หน้าแรกของ basePath → /", () => {
    expect(normalizePathname("/vmi/")).toBe("/");
    expect(normalizePathname("/vmi")).toBe("/");
  });

  it("ตัด query string และ hash ทิ้ง", () => {
    expect(normalizePathname("/vmi/sales/po/?page=2")).toBe("/sales/po");
    expect(normalizePathname("/vmi/sales/po/#top")).toBe("/sales/po");
  });

  it("path ที่ไม่มี basePath อยู่แล้ว ก็ยังใช้ได้", () => {
    expect(normalizePathname("/sales/orders")).toBe("/sales/orders");
  });

  it("ค่าว่าง/null ไม่ทำให้พัง", () => {
    expect(normalizePathname(null)).toBe("");
    expect(normalizePathname(undefined)).toBe("");
    expect(normalizePathname("")).toBe("");
  });

  it("ไม่ตัดคำที่บังเอิญขึ้นต้นเหมือน basePath", () => {
    expect(normalizePathname("/vmicenter/x")).toBe("/vmicenter/x");
  });

  it("ผลลัพธ์เทียบกับ href ที่เขียนในโค้ดได้ตรง ๆ", () => {
    // นี่คือสิ่งที่แถบเมนูต้องการจริง ๆ
    expect(normalizePathname("/vmi/sales/")).toBe("/sales");
    expect(normalizePathname("/vmi/sales/notifications/")).toBe(
      "/sales/notifications"
    );
  });
});

describe("isPathUnder", () => {
  it("ตรงกันพอดี = ใช่", () => {
    expect(isPathUnder("/sales/po", "/sales/po")).toBe(true);
  });

  it("เป็นหน้าลูก = ใช่", () => {
    expect(isPathUnder("/sales/po/123", "/sales/po")).toBe(true);
  });

  it("แค่ขึ้นต้นเหมือนกันแต่คนละหน้า = ไม่ใช่", () => {
    expect(isPathUnder("/sales/potato", "/sales/po")).toBe(false);
  });

  it("คนละสาขา = ไม่ใช่", () => {
    expect(isPathUnder("/sales/orders", "/sales/po")).toBe(false);
  });

  it("/sales ครอบหน้าลูกทั้งหมด — จึงต้องเทียบแบบตรงตัวสำหรับแท็บภาพรวม", () => {
    // เหตุผลที่ sales-nav ใช้ === กับ /sales แทน isPathUnder
    expect(isPathUnder("/sales/orders", "/sales")).toBe(true);
    expect(isPathUnder("/sales", "/sales")).toBe(true);
  });
});

describe("appPath ↔ normalizePathname ไปกลับได้", () => {
  it("แปลงไปแล้วแปลงกลับได้ค่าเดิม", () => {
    for (const p of ["/sales", "/sales/orders", "/stock", "/admin/data/sync"]) {
      expect(normalizePathname(appPath(p))).toBe(p);
    }
  });

  it("รากของแอป", () => {
    expect(appPath("/")).toBe("/vmi/");
    expect(normalizePathname(appPath("/"))).toBe("/");
  });
});
