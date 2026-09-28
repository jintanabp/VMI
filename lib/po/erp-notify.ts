import { prisma } from "@/lib/prisma";
import { notifySales } from "@/lib/orders/sales-notify";
import { notifyStore } from "@/lib/orders/store-notify";
import type { ErpSendFailure } from "./erp-delivery";

/**
 * แจ้งเตือนหลังรู้ผลส่ง ERP / ขอเลขใหม่ — แยกจาก route เพื่อทดสอบได้โดยไม่ต้องยิง ERP จริง
 * (เครื่อง dev ปิดขาส่งไว้ด้วย env จึงไม่มีทางเดินถึงโค้ดใน send-erp route ตอนทดสอบ)
 *
 * เดิมผลการส่งไม่ไปถึงใครเลยนอกจากคนที่กด (QA 28 ก.ย. 69): ส่งไม่สำเร็จแล้วปิดจอ
 * = ไม่มีเซลล์คนอื่นในคลังรู้ว่าต้องตามต่อ · ส่งสำเร็จ/ขอเลขใหม่ ร้านก็ไม่รู้ว่าเลขที่ต้องอ้างอิงคือเลขไหน
 */

/** ตัดข้อความจากปลายทางให้สั้นพอสำหรับแจ้งเตือน — ข้อความเต็มยังอยู่ที่ erpError ของ PO */
export const ERP_NOTIFY_REASON_MAX = 200;

export function shortErpReason(message: string | null | undefined): string {
  const text = (message ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "ไม่ทราบสาเหตุ";
  return text.length > ERP_NOTIFY_REASON_MAX
    ? `${text.slice(0, ERP_NOTIFY_REASON_MAX - 1)}…`
    : text;
}

/** ข้อความแจ้งเซลล์เมื่อส่งไม่สำเร็จ — คืน null = ไม่ต้องแจ้ง */
export function erpFailureNotice(
  poNumber: string,
  failure: ErpSendFailure | undefined,
  message: string | null | undefined
): { title: string; detail: string } | null {
  // not_ready = ยังไม่ได้ยิงอะไรออกไป คนกดเห็นเหตุผลบนจออยู่แล้ว ไม่ใช่ "ผลการส่ง"
  if (failure === "not_ready") return null;
  const guidance =
    failure === "rejected"
      ? "ERP ปฏิเสธใบนี้ — กด \"ขอเลขใหม่แล้วลองส่งอีกครั้ง\" ที่หน้า PO"
      : "ผลไม่ชัดเจน (อาจเข้าไปแล้วก็ได้) — ห้ามส่งซ้ำ ตรวจกับทีม ERP ก่อน";
  return {
    title: `ส่ง PO ${poNumber} เข้า ERP ไม่สำเร็จ`,
    detail: `${guidance} · สาเหตุ: ${shortErpReason(message)}`,
  };
}

export async function notifyErpSendResult(
  args: {
    poNumber: string;
    orderId: string;
    storeId: string;
    actorEmail: string;
  } & (
    | { ok: true }
    | { ok: false; failure?: ErpSendFailure; message?: string | null }
  )
): Promise<void> {
  if (!args.ok) {
    const notice = erpFailureNotice(args.poNumber, args.failure, args.message);
    if (!notice) return;
    // ผูกกับ storeId — เซลล์ทุกคนที่ดูแลคลังนี้เห็นหมด (สิทธิ์คำนวณตอน query ฝั่ง notifications)
    await notifySales({
      storeId: args.storeId,
      kind: "erp_failed",
      title: notice.title,
      detail: notice.detail,
      orderId: args.orderId,
    });
    return;
  }

  // สองคำขอแข่งกันแล้วอีกฝั่งประทับก่อน ก็ได้ ok: true เหมือนกัน — กันร้านได้แจ้งซ้ำสองใบ
  try {
    const dup = await prisma.storeNotification.findFirst({
      where: { storeId: args.storeId, kind: "po_sent_erp", poNumbers: args.poNumber },
      select: { id: true },
    });
    if (dup) return;
  } catch {
    /* ตรวจซ้ำไม่ได้ก็แจ้งไปเลย — ซ้ำดีกว่าเงียบ */
  }
  await notifyStore({
    storeId: args.storeId,
    kind: "po_sent_erp",
    title: `ใบสั่งซื้อ ${args.poNumber} เข้าระบบ ERP แล้ว`,
    detail: "ปลายทางรับใบนี้เข้าระบบแล้ว รอดำเนินการจัดส่งตามขั้นตอน",
    poNumbers: [args.poNumber],
    orderId: args.orderId,
    actorEmail: args.actorEmail,
  });
}

/** ขอเลขใหม่สำเร็จ — ร้านต้องรู้ว่าเลขที่เคยได้ใช้ไม่ได้แล้ว อ้างอิงเลขใหม่แทน */
export async function notifyPoReplaced(args: {
  storeId: string;
  orderId: string;
  oldPoNumber: string;
  newPoNumber: string;
  actorEmail: string;
}): Promise<void> {
  await notifyStore({
    storeId: args.storeId,
    kind: "po_replaced",
    title: `เปลี่ยนเลขใบสั่งซื้อ ${args.oldPoNumber} → ${args.newPoNumber}`,
    detail: `ใบสั่งซื้อ ${args.oldPoNumber} ถูกแทนที่ด้วย ${args.newPoNumber} (รายการและจำนวนเหมือนเดิม) — ใช้เลขใหม่อ้างอิงตอนรับของ`,
    poNumbers: [args.oldPoNumber, args.newPoNumber],
    orderId: args.orderId,
    actorEmail: args.actorEmail,
  });
}
