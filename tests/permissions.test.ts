import { describe, expect, it } from "vitest";
import {
  can,
  hasSalesView,
  hasSettingsAccess,
  homePathFor,
  STAFF_ADMIN_SETTINGS_HOME,
  type AdminPermission,
} from "@/lib/auth/permissions";
import { ADMIN_GROUPS, visibleAdminGroups } from "@/lib/admin/admin-nav";
import type { SalesSession } from "@/lib/auth/sales-session";

/**
 * ตารางสิทธิ์ 4 ตำแหน่ง (ตัดสิน 28 ก.ย. 2569) — creator (.env) · admin · admin+เซลล์ · เซลล์
 * ร้านค้าไม่มี SalesSession จึงไม่อยู่ในตารางนี้
 */
const creator: SalesSession = { email: "dev@x", role: "admin", adminAccess: "creator" };
const admin: SalesSession = { email: "a@x", role: "sales", adminAccess: "admin", scopeSalesmanCodes: [] };
const adminSales: SalesSession = {
  email: "as@x",
  role: "sales",
  adminAccess: "admin",
  salesmanCode: "S555",
};
const sales: SalesSession = { email: "s@x", role: "sales", salesmanCode: "S091" };
const manager: SalesSession = { email: "m@x", role: "manager", salesmanCode: "M001" };

const ALL: AdminPermission[] = [
  "stores.view",
  "stores.approve",
  "stores.resetPassword",
  "stores.create",
  "promotions.view",
  "salesCodes.view",
  "salesCodes.addEmail",
];

describe("can() — สิทธิ์ย่อยในหน้าตั้งค่า", () => {
  it("creator ได้ทุกสิทธิ์", () => {
    for (const p of ALL) expect(can(creator, p)).toBe(true);
  });

  it("admin และ admin+เซลล์ ได้สิทธิ์ร้านค้า/โปรตามที่กำหนด", () => {
    for (const p of ALL) {
      expect(can(admin, p)).toBe(true);
      expect(can(adminSales, p)).toBe(true);
    }
  });

  it("เซลล์/หัวหน้าที่ไม่ใช่ admin ไม่ได้สักสิทธิ์", () => {
    for (const p of ALL) {
      expect(can(sales, p)).toBe(false);
      expect(can(manager, p)).toBe(false);
      expect(can(null, p)).toBe(false);
    }
  });

  it("ปลอม adminAccess 'creator' โดยไม่มี role admin → ไม่ใช่ creator", () => {
    // role มาจาก token ที่เซ็นแล้ว แต่กันไว้ไม่ให้ฟิลด์เดียวกลายเป็นสิทธิ์เต็ม
    const forged = { ...sales, adminAccess: "creator" as const };
    expect(hasSettingsAccess(forged)).toBe(false);
  });
});

describe("หน้าต่างที่เข้าได้", () => {
  it("หน้าตั้งค่า: creator + admin ทุกแบบ", () => {
    expect(hasSettingsAccess(creator)).toBe(true);
    expect(hasSettingsAccess(admin)).toBe(true);
    expect(hasSettingsAccess(adminSales)).toBe(true);
    expect(hasSettingsAccess(sales)).toBe(false);
  });

  it("หน้าเซลล์: admin ที่ไม่มีรหัสเซลล์เข้าไม่ได้", () => {
    expect(hasSalesView(creator)).toBe(true);
    expect(hasSalesView(admin)).toBe(false);
    expect(hasSalesView(adminSales)).toBe(true);
    expect(hasSalesView(sales)).toBe(true);
  });

  it("หน้าแรกหลัง login — admin+เซลล์ ไปหน้าเซลล์เป็นค่าเริ่มต้น", () => {
    expect(homePathFor(creator)).toBe("/admin");
    expect(homePathFor(admin)).toBe("/admin/stores/accounts");
    expect(homePathFor(adminSales)).toBe("/sales/orders");
    expect(homePathFor(sales)).toBe("/sales/orders");
  });
});

describe("เมนูหน้าตั้งค่าตามตำแหน่ง", () => {
  const hrefs = (s: SalesSession | null) =>
    visibleAdminGroups(s).flatMap((g) => g.subTabs.map((t) => t.href));

  it("creator เห็นทุกแท็บ", () => {
    expect(hrefs(creator)).toEqual(ADMIN_GROUPS.flatMap((g) => g.subTabs.map((t) => t.href)));
  });

  it("admin เห็นแค่บัญชีร้านค้า + โปร C4 + สิทธิ์เซลล์-VDA (ไม่เห็นหน้าผู้ดูแล)", () => {
    const expected = [
      "/admin/stores/accounts",
      "/admin/promotions/c4",
      "/admin/system/vda-sales",
    ];
    expect(hrefs(admin)).toEqual(expected);
    expect(hrefs(adminSales)).toEqual(expected);
  });

  it("ไม่ใช่ admin ไม่เห็นอะไรเลย", () => {
    expect(hrefs(sales)).toEqual([]);
  });

  it("หน้าแรกของ admin อยู่ในแท็บที่ตัวเองเห็นจริง (กันวน redirect)", () => {
    expect(hrefs(admin)).toContain(homePathFor(admin));
    expect(hrefs(adminSales)).toContain(STAFF_ADMIN_SETTINGS_HOME);
  });
});
