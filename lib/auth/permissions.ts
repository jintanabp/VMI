/**
 * สิทธิ์หน้าตั้งค่า (/admin) — แหล่งความจริงเดียว
 *
 * ตำแหน่ง (ตัดสิน 28 ก.ย. 2569):
 * - **Creator (dev)** = อีเมลใน `ADMIN_EMAILS` ใน .env · session `role: "admin"` · ทำได้ทุกอย่าง
 * - **Admin** = อีเมลในตาราง `Admin` ที่ creator เพิ่ม · session `adminAccess: "admin"` แต่ `role`
 *   เป็น "sales" (ขอบเขตตามรหัสที่ผูกกับอีเมล) — เข้าหน้าตั้งค่าได้แค่สิทธิ์ใน ADMIN_PERMISSIONS
 *
 * ทำไม `role: "admin"` = creator เท่านั้น: โค้ดราว 75 จุดตรวจ `role === "admin"` แล้วให้สิทธิ์เต็ม
 * (เห็นออเดอร์ทุกร้าน สวมสิทธิ์ดูหน้าร้าน แก้ข้อมูลระบบ) — ให้ admin ใหม่ถือ role อื่นแทน
 * จุดที่ลืมแก้จะ "ทำไม่ได้" ไม่ใช่ "ได้สิทธิ์เกิน"
 *
 * ไฟล์นี้เป็น .ts ล้วน ไม่ import Prisma — ใช้ได้ทั้ง server/client และเทสต์ได้ใต้ node
 */
import type { SalesSession } from "./sales-session";

export type AdminAccess = "creator" | "admin";

export type AdminPermission =
  /** ดูรายการร้านที่รออนุมัติ + อนุมัติแล้ว (ไม่เห็นที่ถูกปฏิเสธ) */
  | "stores.view"
  /** อนุมัติคำขอเข้าใช้งานที่รออยู่ (เลือก VDA ตอนอนุมัติได้) */
  | "stores.approve"
  | "stores.resetPassword"
  /** เพิ่มบัญชีร้านใหม่ (อนุมัติทันที) — admin ตั้งสิทธิ์ min/max ไม่ได้ */
  | "stores.create"
  /** ดู/ค้นหาโปร C4 ทุกคลัง */
  | "promotions.view"
  /** ดูตารางรหัสเซลล์ ↔ อีเมล ↔ VDA */
  | "salesCodes.view"
  /**
   * เพิ่มอีเมลที่เข้าใช้งานในฐานะรหัสเซลล์ — admin เพิ่มได้แต่เอาออกไม่ได้ และกำหนดให้อีเมลของ
   * ผู้ดูแลระบบไม่ได้ (ตั้ง admin เป็นเซลล์เป็นของ creator)
   */
  | "salesCodes.addEmail";

const ADMIN_PERMISSIONS: ReadonlySet<AdminPermission> = new Set<AdminPermission>([
  "stores.view",
  "stores.approve",
  "stores.resetPassword",
  "stores.create",
  "promotions.view",
  "salesCodes.view",
  "salesCodes.addEmail",
]);

type AccessSession =
  | Pick<SalesSession, "role" | "adminAccess" | "salesmanCode">
  | null
  | undefined;

export function isCreator(session: AccessSession): boolean {
  return session?.role === "admin";
}

/** admin ที่ creator เพิ่ม (ไม่ใช่ creator) */
export function isStaffAdmin(session: AccessSession): boolean {
  return !isCreator(session) && session?.adminAccess === "admin";
}

/** เข้าหน้าตั้งค่า (/admin) ได้หรือไม่ — ได้บางแท็บก็นับ */
export function hasSettingsAccess(session: AccessSession): boolean {
  return isCreator(session) || isStaffAdmin(session);
}

/** creator ผ่านทุกสิทธิ์ · admin ผ่านเฉพาะที่อยู่ใน ADMIN_PERMISSIONS */
export function can(session: AccessSession, permission: AdminPermission): boolean {
  if (isCreator(session)) return true;
  return isStaffAdmin(session) && ADMIN_PERMISSIONS.has(permission);
}

/**
 * ใช้หน้าเซลล์ (/sales) ได้หรือไม่ — admin ที่ไม่มีรหัสเซลล์ใช้หน้าตั้งค่าอย่างเดียว
 * (creator ใช้ได้เสมอเหมือนเดิม — เห็นออเดอร์ทุกร้าน)
 */
export function hasSalesView(session: AccessSession): boolean {
  if (!session) return false;
  if (isStaffAdmin(session)) return !!session.salesmanCode;
  return true;
}

/** หน้าแรกในหน้าตั้งค่าของ admin — ต้องเป็นแท็บที่ admin เห็นจริง (มีเทสต์กันวน redirect) */
export const STAFF_ADMIN_SETTINGS_HOME = "/admin/stores/accounts";

/** หน้าแรกหลัง login ของแต่ละตำแหน่ง */
export function homePathFor(session: AccessSession): string {
  if (!session) return "/login?mode=sales";
  if (isCreator(session)) return "/admin";
  if (isStaffAdmin(session)) {
    return session.salesmanCode ? "/sales/orders" : STAFF_ADMIN_SETTINGS_HOME;
  }
  return "/sales/orders";
}

export function adminAccessLabel(session: AccessSession): string | null {
  if (isCreator(session)) return "Creator";
  if (isStaffAdmin(session)) return "Admin";
  return null;
}
