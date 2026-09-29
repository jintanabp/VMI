import { prisma } from "@/lib/prisma";
import { ERP_RESULT_UNKNOWN, SENT_TO_ERP, SENDING_TO_ERP } from "./po-status";

/**
 * ปิดเรื่อง "ส่งแล้วไม่รู้ผล" หลังคนไปตรวจกับทีม ERP แล้ว (29 ก.ย. 2569)
 *
 * ใบที่ timeout / เน็ตหลุด / HTTP error ถูกล็อกไว้ทุกทาง (ส่งซ้ำ ขอเลขใหม่ ลบ ยกเลิก ไม่ได้)
 * เพราะเครื่องไม่รู้ว่าเข้าไปแล้วหรือยัง — ฟังก์ชันนี้ให้คนที่รู้คำตอบแล้วบอกระบบ:
 *
 * - `in_erp` — ทีม ERP ยืนยันว่ามีใบนี้ → ปักว่าส่งสำเร็จ (`erpSentAt` + "เข้า ERP แล้ว")
 * - `not_in_erp` — ทีม ERP ยืนยันว่าไม่มี → ล้างผลการส่งครั้งก่อน ใบกลับไปส่งได้ **ด้วยเลขเดิม**
 *
 * ทำไมไม่ให้ขอเลขใหม่ในกรณี "ไม่มี": ถ้าคำยืนยันผิดและใบเข้าไปแล้วจริง การส่งเลขเดิมซ้ำจะโดน
 * ปลายทางตีกลับเพราะ orderNo+customerCode ซ้ำ (ไม่เกิดออเดอร์ซ้อน) แต่เลขใหม่จะกลายเป็นออเดอร์
 * ที่สองในระบบจริง — เลขเดิมจึงปลอดภัยกว่าเสมอ
 *
 * ถูกปฏิเสธชัดเจน (`rejected`) ไม่ใช่เรื่องของฟังก์ชันนี้ — ใบแบบนั้นมีทางออกอยู่แล้ว (clone-for-erp)
 */

export type ErpResolution = "in_erp" | "not_in_erp";

export const ERP_RESOLVE_NOTE_MIN = 3;
export const ERP_RESOLVE_NOTE_MAX = 300;

export class ErpResolveError extends Error {
  constructor(
    public code:
      | "PO_NOT_FOUND"
      | "NOT_AMBIGUOUS"
      | "ALREADY_SENT"
      | "REPLACED"
      | "SENDING"
      | "CHANGED"
  ) {
    super(code);
  }
}

export interface ErpResolveResult {
  poNumber: string;
  resolution: ErpResolution;
  /** ข้อความ error เดิมก่อนถูกล้าง — ผู้เรียกเก็บลง audit log ไว้เป็นหลักฐาน */
  previousError: string;
  previousFailureKind: string | null;
  orderId: string;
  storeId: string;
}

export async function resolveAmbiguousErpResult(args: {
  poNumber: string;
  resolution: ErpResolution;
  note: string;
  actorEmail: string;
  now?: Date;
}): Promise<ErpResolveResult> {
  const now = args.now ?? new Date();
  const note = args.note.trim().slice(0, ERP_RESOLVE_NOTE_MAX);

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber: args.poNumber },
    select: {
      orderId: true,
      status: true,
      erpSentAt: true,
      erpError: true,
      erpFailureKind: true,
      replacedByPoNumber: true,
      order: { select: { storeId: true } },
    },
  });
  if (!po) throw new ErpResolveError("PO_NOT_FOUND");
  if (po.erpSentAt) throw new ErpResolveError("ALREADY_SENT");
  if (po.replacedByPoNumber) throw new ErpResolveError("REPLACED");
  if (po.status === SENDING_TO_ERP) throw new ErpResolveError("SENDING");
  // ต้องเคยพลาดแบบไม่รู้ผลจริง — แถวเก่าก่อนมี failureKind (null) นับว่าไม่รู้ผลด้วย
  // (นิยามเดียวกับ poMayBeInErp)
  if (!po.erpError || po.erpFailureKind === "rejected") {
    throw new ErpResolveError("NOT_AMBIGUOUS");
  }

  const statusNote =
    args.resolution === "in_erp"
      ? `ยืนยันกับทีม ERP แล้วว่าเข้าระบบแล้ว — ${note}`
      : `ยืนยันกับทีม ERP แล้วว่าไม่เข้าระบบ ส่งใหม่ด้วยเลขเดิมได้ — ${note}`;

  // compare-and-set: ถ้าระหว่างนั้นมีคนกดส่ง/แก้ไปแล้ว ไม่เขียนทับ
  const { count } = await prisma.purchaseOrder.updateMany({
    where: {
      poNumber: args.poNumber,
      erpSentAt: null,
      replacedByPoNumber: null,
      erpError: po.erpError,
      status: { not: SENDING_TO_ERP },
    },
    data:
      args.resolution === "in_erp"
        ? {
            erpSentAt: now,
            erpError: null,
            erpFailureKind: null,
            status: SENT_TO_ERP,
            statusAt: now,
            statusBy: args.actorEmail,
            statusNote,
          }
        : {
            erpAttemptedAt: null,
            erpError: null,
            erpFailureKind: null,
            // ใบที่ตั้ง "ERP ไม่ตอบ" ไว้กลับเป็น "ออกแล้ว" · ใบเก่าที่คนเคยตั้งสถานะอื่นไว้ (เช่น ส่งซัพ) คงเดิม
            ...(po.status === ERP_RESULT_UNKNOWN ? { status: "issued" } : {}),
            statusAt: now,
            statusBy: args.actorEmail,
            statusNote,
          },
  });
  if (count === 0) throw new ErpResolveError("CHANGED");

  return {
    poNumber: args.poNumber,
    resolution: args.resolution,
    previousError: po.erpError,
    previousFailureKind: po.erpFailureKind,
    orderId: po.orderId,
    storeId: po.order.storeId,
  };
}
