/**
 * ป้ายของ audit log — แยกจาก audit-log.ts เพราะไฟล์นั้น import prisma (server-only)
 * ส่วนไฟล์นี้หน้าเว็บใช้ตรง ๆ ได้
 */

/** ป้ายภาษาไทยต่อ action — เพิ่ม action ใหม่ต้องเพิ่มตรงนี้ด้วย ไม่งั้นหน้าเว็บโชว์ชื่อดิบ */
export const AUDIT_ACTION_LABELS = {
  "store.create": "เพิ่มบัญชีร้านค้า",
  "store.approve": "อนุมัติบัญชีร้านค้า",
  "store.reject": "ปฏิเสธบัญชีร้านค้า",
  "store.setVda": "เปลี่ยน VDA ของบัญชีร้าน",
  "store.setCanManage": "เปลี่ยนสิทธิ์ MIN/MAX ของร้าน",
  "store.resetPassword": "รีเซ็ตรหัสผ่านร้าน",
  "store.setEmail": "เปลี่ยนอีเมลบัญชีร้าน",
  "store.delete": "ลบบัญชีร้านค้า",
  "admin.add": "เพิ่มผู้ดูแล",
  "admin.remove": "ลบผู้ดูแล",
  "salesCode.assign": "ผูกอีเมลกับรหัสเซลล์",
  "salesCode.unassign": "ยกเลิกการผูกรหัสเซลล์",
  "warehouses.save": "แก้ทะเบียนคลัง VDA",
  "thresholds.update": "แก้ MIN/MAX ของร้าน",
  "blocklist.add": "ตั้งหยุดสั่งสินค้า",
  "blocklist.remove": "ยกเลิกหยุดสั่งสินค้า",
  "masters.refresh": "สั่งดึงข้อมูล Fabric",
  "orders.delete": "ลบออเดอร์",
  "po.erpResolve": "แก้สถานะ ERP ไม่ตอบ",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

/**
 * ป้ายของฟิลด์ใน detail — ผู้จดต้องใช้คีย์จากชุดนี้ ไม่งั้นหน้าเว็บโชว์ชื่อคีย์ภาษาอังกฤษ
 * (ผู้จดควรจดค่าที่คนอ่านออก เช่น รหัสสินค้า ไม่ใช่ id ในฐานข้อมูล)
 */
export const AUDIT_DETAIL_LABELS: Record<string, string> = {
  vdaCode: "VDA",
  canManageMinMax: "สิทธิ์ MIN/MAX",
  newEmail: "อีเมลใหม่",
  salesmanCode: "รหัสเซลล์",
  warehouses: "คลัง",
  datasets: "ชุดข้อมูล",
  store: "ร้าน",
  skus: "สินค้า",
  reason: "เหตุผล",
  until: "ถึง",
  scope: "ขอบเขต",
  minDays: "MIN (วัน)",
  maxDays: "MAX (วัน)",
  poNumbers: "PO",
  notifyStore: "แจ้งร้าน",
  resolution: "ผลการตรวจ",
  note: "บันทึก",
  previousError: "ผลการส่งเดิม",
};

function fmtValue(v: unknown): string {
  if (v === true) return "ใช่";
  if (v === false) return "ไม่";
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length > 0 ? v.map(fmtValue).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** detail (JSON) → "ป้าย: ค่า · ป้าย: ค่า" · อ่านไม่ออก (แถวเก่า/ถูกตัด) โชว์ข้อความดิบ */
export function formatAuditDetail(detail: string): string {
  if (!detail) return "";
  try {
    const obj = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => `${AUDIT_DETAIL_LABELS[k] ?? k}: ${fmtValue(v)}`)
      .join(" · ");
  } catch {
    return detail;
  }
}

export interface AuditLogRow {
  id: string;
  createdAt: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  actionLabel: string;
  target: string;
  detail: string;
}
