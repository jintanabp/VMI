/**
 * โครงเมนูหน้าแอดมิน — 5 หมวดหลัก แต่ละหมวดมีแท็บย่อย
 *
 * เดิมเป็นแท็บเรียงแบน ๆ 7 อัน ที่ไม่ได้แบ่งหมวด: ทะเบียนคลัง VDA (ตั้งค่าข้อมูล)
 * อยู่หน้าเดียวกับมุมมองทดสอบ VDA (สวมสิทธิ์ดูหน้าร้าน) ทั้งที่คนละเรื่องกันคนละโลก
 *
 * ไฟล์นี้เป็น .ts ล้วนโดยตั้งใจ — ไอคอนเก็บเป็น "iconKey" แล้วค่อยไป map เป็น component
 * ในไฟล์ .tsx เพื่อให้เทสต์รันได้ใต้ environment: "node" ตามนโยบายใน vitest.config.ts
 */

export type AdminIconKey = "database" | "store" | "tag" | "eye" | "shield";
export type AdminBadgeKey = "storePending" | "syncFailed" | "promoNotReady";

export interface AdminSubTabDef {
  href: string;
  label: string;
  badge?: AdminBadgeKey;
}

export interface AdminGroupDef {
  key: "data" | "stores" | "promotions" | "preview" | "system";
  label: string;
  iconKey: AdminIconKey;
  /** ต้องไม่เป็น prefix ของ basePath หมวดอื่น */
  basePath: string;
  subTabs: AdminSubTabDef[];
}

export const ADMIN_GROUPS: AdminGroupDef[] = [
  {
    key: "data",
    label: "ข้อมูล",
    iconKey: "database",
    basePath: "/admin/data",
    subTabs: [
      { href: "/admin/data/sync", label: "Sync & สถานะ", badge: "syncFailed" },
      { href: "/admin/data/raw", label: "ดูข้อมูลดิบ" },
      { href: "/admin/data/warehouses", label: "ทะเบียนคลัง VDA" },
    ],
  },
  {
    key: "stores",
    label: "ร้านค้า",
    iconKey: "store",
    basePath: "/admin/stores",
    subTabs: [
      { href: "/admin/stores/accounts", label: "บัญชีร้านค้า", badge: "storePending" },
      { href: "/admin/stores/thresholds", label: "MIN/MAX & หยุดสั่ง" },
    ],
  },
  {
    key: "promotions",
    label: "โปรโมชั่น",
    iconKey: "tag",
    basePath: "/admin/promotions",
    subTabs: [
      { href: "/admin/promotions/c4", label: "โปร C4 เดือนนี้", badge: "promoNotReady" },
    ],
  },
  {
    key: "preview",
    label: "มุมมองทดสอบ",
    iconKey: "eye",
    basePath: "/admin/preview",
    subTabs: [
      { href: "/admin/preview/vda", label: "มุมมอง VDA" },
      { href: "/admin/preview/sales", label: "มุมมองเซลล์" },
    ],
  },
  {
    key: "system",
    label: "ระบบ",
    iconKey: "shield",
    basePath: "/admin/system",
    subTabs: [
      { href: "/admin/system/admins", label: "ผู้ดูแล" },
      { href: "/admin/system/vda-sales", label: "สิทธิ์เซลล์-VDA" },
    ],
  },
];

/**
 * URL เดิม → URL ใหม่ · แหล่งความจริงเดียวของ redirect stub ทุกไฟล์
 *
 * ลิงก์เก่าที่ส่งกันในแชทหรือที่ bookmark ไว้ต้องใช้ได้ต่อ — มีเทสต์ยืนยันว่าทุกค่าใน
 * map ชี้ไป href ที่มีอยู่จริง เปลี่ยนชื่อ route แล้วจะไม่มี bookmark ไหนค้างเงียบ ๆ
 */
export const ADMIN_LEGACY_REDIRECTS: Record<string, string> = {
  "/admin": "/admin/data/sync",
  "/admin/dev": "/admin/data/sync",
  "/admin/sync": "/admin/data/sync",
  "/admin/stores": "/admin/stores/accounts",
  "/admin/thresholds": "/admin/stores/thresholds",
  "/admin/promo": "/admin/promotions/c4",
  "/admin/vda": "/admin/preview/vda",
  "/admin/sales": "/admin/preview/sales",
  "/admin/settings": "/admin/system/admins",
};

const BASE_PATH = "/vmi";

/**
 * ตัด basePath กับ trailing slash ออกให้เหลือ path ที่เทียบกับทะเบียนได้
 *
 * next.config.ts ตั้ง basePath: "/vmi" และ trailingSlash: true — usePathname() จึงคืน
 * "/vmi/admin/data/sync/" ไม่ใช่ "/admin/data/sync" · ของเดิมเทียบด้วย startsWith เฉย ๆ
 * เลยรอดมาได้เพราะบังเอิญ (prefix ตรงพอดี) แต่ทำให้ /admin/storesomething ติดว่าเป็น
 * /admin/stores ไปด้วย
 */
export function normalizeAdminPath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  let p = pathname.split("?")[0].split("#")[0];
  if (p === BASE_PATH) return "/";
  if (p.startsWith(`${BASE_PATH}/`)) p = p.slice(BASE_PATH.length);
  while (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** ตรงกันพอดี หรือเป็นโฟลเดอร์ลูก — ไม่ใช่แค่ขึ้นต้นเหมือนกัน */
function isUnder(p: string, base: string): boolean {
  return p === base || p.startsWith(`${base}/`);
}

export interface AdminNavMatch {
  group: AdminGroupDef;
  sub: AdminSubTabDef | null;
}

export function matchAdminNav(pathname: string | null): AdminNavMatch | null {
  const p = normalizeAdminPath(pathname);
  if (!p) return null;

  for (const group of ADMIN_GROUPS) {
    if (!isUnder(p, group.basePath)) continue;
    // แท็บย่อยที่ยาวที่สุดที่ยังครอบ path อยู่ชนะ — กัน basePath ของหมวดไปชนะแท็บย่อย
    let best: AdminSubTabDef | null = null;
    for (const sub of group.subTabs) {
      if (isUnder(p, sub.href) && (!best || sub.href.length > best.href.length)) {
        best = sub;
      }
    }
    return { group, sub: best };
  }
  return null;
}
