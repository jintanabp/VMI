import { prisma } from "@/lib/prisma";
import { isCreator, isStaffAdmin } from "@/lib/auth/permissions";
import type { SalesSession } from "@/lib/auth/sales-session";
import {
  auditActionLabel,
  type AuditAction,
  type AuditLogRow,
} from "./audit-log-labels";

export { AUDIT_ACTION_LABELS, auditActionLabel } from "./audit-log-labels";
export type { AuditAction, AuditLogRow } from "./audit-log-labels";

/**
 * บันทึกการกระทำของผู้ดูแลระบบ — ตอบคำถาม "ใครอนุมัติ/ลบ/รีเซ็ต/ผูกรหัสนี้ เมื่อไหร่"
 *
 * เดิมมีแค่ `console.info` ของการลบออเดอร์ ซึ่งหายไปพร้อม log ของ container
 * ส่วนการกระทำอื่นของแอดมินไม่มีร่องรอยเลย (QA 28 ก.ย. 69 ข้อเสนอ · ผู้ใช้เลือกทำ 29 ก.ย.)
 *
 * ผู้เรียกต้องส่ง **raw session** (`getRawSalesSession`) — มุมมองทดสอบต้องจดชื่อคนที่กดจริง
 */

type AuditActor = Pick<SalesSession, "email" | "role" | "adminAccess" | "salesmanCode">;

export function auditActorRole(actor: AuditActor): "creator" | "admin" | "sales" {
  if (isCreator(actor)) return "creator";
  if (isStaffAdmin(actor)) return "admin";
  return "sales";
}

/** detail ยาวเกินนี้ตัดทิ้ง — กันใครส่ง body ใหญ่ ๆ มาแล้วตารางบวม */
const DETAIL_MAX_LEN = 2000;
const VALUE_MAX_LEN = 300;
const LIST_MAX_ITEMS = 30;

/** ย่อค่าก่อนแปลงเป็น JSON — ตัดทีละค่า JSON จึงยังอ่านออก (ตัดทั้งก้อนแล้วหน้าเว็บ parse ไม่ได้) */
function shrink(v: unknown): unknown {
  if (typeof v === "string") {
    return v.length > VALUE_MAX_LEN ? `${v.slice(0, VALUE_MAX_LEN - 1)}…` : v;
  }
  if (Array.isArray(v)) {
    const head = v.slice(0, LIST_MAX_ITEMS).map(shrink);
    return v.length > LIST_MAX_ITEMS ? [...head, `…อีก ${v.length - LIST_MAX_ITEMS} รายการ`] : head;
  }
  return v;
}

/**
 * จดหนึ่งแถว — **ไม่โยน error เด็ดขาด** การจดล้มต้องไม่ทำให้งานที่ทำสำเร็จไปแล้วตอบว่าล้ม
 * (เรียกหลังการกระทำสำเร็จเท่านั้น — ไม่จดความพยายามที่โดนปฏิเสธ)
 */
export async function recordAudit(
  actor: AuditActor,
  action: AuditAction,
  target: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    let detailText = detail
      ? JSON.stringify(Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, shrink(v)])))
      : "";
    if (detailText.length > DETAIL_MAX_LEN) {
      detailText = `${detailText.slice(0, DETAIL_MAX_LEN - 1)}…`;
    }
    await prisma.adminAuditLog.create({
      data: {
        actorEmail: actor.email,
        actorRole: auditActorRole(actor),
        action,
        target: target.slice(0, 500),
        detail: detailText,
      },
    });
  } catch (err) {
    console.warn(`[audit] failed to record ${action} ${target}:`, err);
  }
}

/** id สินค้าจาก body ของ request → รหัสสินค้าที่คนอ่านออก (id ที่ไม่มีจริงถูกข้ามไป) */
export async function auditSkuCodes(skuIds: unknown): Promise<string[]> {
  const ids = (Array.isArray(skuIds) ? skuIds : skuIds ? [skuIds] : []).map(String);
  if (ids.length === 0) return [];
  const rows = await prisma.sku.findMany({ where: { id: { in: ids } }, select: { code: true } });
  return rows.map((r) => r.code).sort();
}

export const AUDIT_PAGE_SIZE = 100;

/**
 * ใหม่สุดก่อน · กรองด้วยข้อความ (อีเมลผู้กด / เป้าหมาย) และ action ได้
 * `afterId` = id แถวสุดท้ายของหน้าก่อน — ใช้ cursor ของ id ไม่ใช่เวลา เพราะลบออเดอร์หลายใบ
 * ในครั้งเดียวได้หลายแถวเวลาเดียวกัน (เทียบเวลาแล้วแถวที่เวลาชนกันจะหายไปจากหน้าถัดไป)
 */
export async function listAuditLog(opts: {
  q?: string;
  action?: string;
  afterId?: string;
  limit?: number;
}): Promise<{ rows: AuditLogRow[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? AUDIT_PAGE_SIZE, 1), 500);
  const q = opts.q?.trim().toLowerCase();
  const rows = await prisma.adminAuditLog.findMany({
    where: {
      ...(opts.action ? { action: opts.action } : {}),
      ...(q
        ? { OR: [{ actorEmail: { contains: q } }, { target: { contains: q } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(opts.afterId ? { cursor: { id: opts.afterId }, skip: 1 } : {}),
    take: limit + 1,
  });
  return {
    hasMore: rows.length > limit,
    rows: rows.slice(0, limit).map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      action: r.action,
      actionLabel: auditActionLabel(r.action),
      target: r.target,
      detail: r.detail,
    })),
  };
}
