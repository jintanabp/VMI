import { describe, expect, it } from "vitest";
import {
  ADMIN_GROUPS,
  ADMIN_LEGACY_REDIRECTS,
  matchAdminNav,
  normalizeAdminPath,
} from "@/lib/admin/admin-nav";

/**
 * เมนูแอดมิน — จุดที่พลาดง่ายคือ path ที่ usePathname() คืนมาไม่ใช่ path ที่เราเขียนไว้
 * next.config.ts ตั้ง basePath "/vmi" + trailingSlash true พร้อมกัน
 */

const allHrefs = new Set(ADMIN_GROUPS.flatMap((g) => g.subTabs.map((s) => s.href)));

describe("normalizeAdminPath", () => {
  it("ตัด basePath /vmi และ trailing slash ออก", () => {
    expect(normalizeAdminPath("/vmi/admin/data/sync/")).toBe("/admin/data/sync");
    expect(normalizeAdminPath("/vmi/admin/data/sync")).toBe("/admin/data/sync");
    expect(normalizeAdminPath("/admin/data/sync/")).toBe("/admin/data/sync");
  });

  it("รับ null/ว่างได้โดยไม่พัง", () => {
    expect(normalizeAdminPath(null)).toBe("");
    expect(normalizeAdminPath(undefined)).toBe("");
  });

  it("ตัด query กับ hash ทิ้ง", () => {
    expect(normalizeAdminPath("/vmi/admin/data/raw/?src=csv:sku_master")).toBe(
      "/admin/data/raw"
    );
  });
});

describe("matchAdminNav", () => {
  it("จับหมวดและแท็บย่อยได้ถูก", () => {
    const m = matchAdminNav("/vmi/admin/data/raw/")!;
    expect(m.group.key).toBe("data");
    expect(m.sub?.href).toBe("/admin/data/raw");
  });

  it("path ที่แค่ขึ้นต้นเหมือนกันต้องไม่ถูกจับ", () => {
    // บั๊กของ startsWith เดิม: /admin/storesomething เคยติดว่าเป็นหมวดร้านค้า
    expect(matchAdminNav("/admin/storesomething")).toBeNull();
  });

  it("/admin/stores เป็นทั้งชื่อหมวดและ URL เก่า — จับได้แค่หมวด ยังไม่มีแท็บย่อย", () => {
    const m = matchAdminNav("/admin/stores")!;
    expect(m.group.key).toBe("stores");
    expect(m.sub).toBeNull();
  });

  it("path ที่ไม่รู้จักคืน null", () => {
    expect(matchAdminNav("/admin/ไม่มีหน้านี้")).toBeNull();
    expect(matchAdminNav("/sales/orders")).toBeNull();
  });

  it("หน้าลูกของแท็บย่อยยังนับเป็นแท็บย่อยนั้น", () => {
    expect(matchAdminNav("/admin/data/raw/anything")?.sub?.href).toBe("/admin/data/raw");
  });
});

describe("ความครบถ้วนของทะเบียน", () => {
  it("ทุก URL เก่าชี้ไปหน้าที่มีอยู่จริง", () => {
    for (const [from, to] of Object.entries(ADMIN_LEGACY_REDIRECTS)) {
      expect(allHrefs.has(to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("URL เก่าทั้ง 7 แท็บเดิม บวกหน้า index และ /admin/dev ต้องมีที่ไป", () => {
    for (const old of [
      "/admin",
      "/admin/dev",
      "/admin/sync",
      "/admin/stores",
      "/admin/thresholds",
      "/admin/promo",
      "/admin/vda",
      "/admin/sales",
      "/admin/settings",
    ]) {
      expect(ADMIN_LEGACY_REDIRECTS[old], old).toBeTruthy();
    }
  });

  it("basePath ของหมวดต้องไม่เป็น prefix ของหมวดอื่น", () => {
    for (const a of ADMIN_GROUPS) {
      for (const b of ADMIN_GROUPS) {
        if (a.key === b.key) continue;
        expect(b.basePath.startsWith(`${a.basePath}/`), `${a.basePath} vs ${b.basePath}`).toBe(
          false
        );
      }
    }
  });

  it("แท็บย่อยทุกอันอยู่ใต้ basePath ของหมวดตัวเอง", () => {
    for (const g of ADMIN_GROUPS) {
      for (const s of g.subTabs) {
        expect(s.href.startsWith(`${g.basePath}/`), s.href).toBe(true);
      }
    }
  });

  it("ไม่มี href ซ้ำกันข้ามหมวด", () => {
    const all = ADMIN_GROUPS.flatMap((g) => g.subTabs.map((s) => s.href));
    expect(new Set(all).size).toBe(all.length);
  });
});
