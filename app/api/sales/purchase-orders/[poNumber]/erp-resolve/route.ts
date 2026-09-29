import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSalesSession, salesPreviewReadOnly } from "@/lib/auth/sales-session";
import { assertOrderAccess } from "@/lib/orders/access";
import { sanitizePoNumber } from "@/lib/po/po-number";
import {
  ERP_RESOLVE_NOTE_MAX,
  ERP_RESOLVE_NOTE_MIN,
  ErpResolveError,
  resolveAmbiguousErpResult,
} from "@/lib/po/erp-resolve";
import { notifyErpSendResult } from "@/lib/po/erp-notify";
import { recordAudit } from "@/lib/admin/audit-log";

const bodySchema = z.object({
  resolution: z.enum(["in_erp", "not_in_erp"]),
  note: z.string().trim().min(ERP_RESOLVE_NOTE_MIN).max(ERP_RESOLVE_NOTE_MAX),
});

const ERROR_TEXT: Record<ErpResolveError["code"], [number, string]> = {
  PO_NOT_FOUND: [404, "ไม่พบ PO"],
  NOT_AMBIGUOUS: [409, "ใบนี้ไม่ได้อยู่ในสถานะ \"ERP ไม่ตอบ\" — ไม่มีอะไรต้องแก้"],
  ALREADY_SENT: [409, "ใบนี้บันทึกว่าเข้า ERP แล้ว"],
  REPLACED: [409, "ใบนี้ถูกแทนที่ด้วยเลขใหม่แล้ว"],
  SENDING: [409, "ใบนี้กำลังส่งเข้า ERP อยู่ — รอผลก่อน"],
  CHANGED: [409, "ใบนี้ถูกแก้ไประหว่างทาง — รีเฟรชแล้วลองใหม่"],
};

/**
 * แก้สถานะ "ERP ไม่ตอบ — รอตรวจ" หลังตรวจกับทีม ERP แล้ว (ดูเหตุผลที่ lib/po/erp-resolve.ts)
 *
 * **ไม่ยิงอะไรออกไปนอกเครื่อง** — แค่บันทึกคำตอบที่คนได้มาจากทีม ERP · สิทธิ์เท่ากับการส่ง ERP
 * (เซลล์ที่ดูแลออเดอร์นั้น / creator) · มุมมองทดสอบห้าม · ต้องมีบันทึกว่าตรวจกับใคร และจดลง audit log
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ poNumber: string }> }
) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const previewBlock = salesPreviewReadOnly(session);
  if (previewBlock) return previewBlock;

  const { poNumber: raw } = await ctx.params;
  const poNumber = sanitizePoNumber(decodeURIComponent(raw));
  if (!poNumber) {
    return NextResponse.json({ error: "เลข PO ไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `ต้องเลือกผลการตรวจ และบันทึกว่าตรวจกับใคร (อย่างน้อย ${ERP_RESOLVE_NOTE_MIN} ตัวอักษร)` },
      { status: 400 }
    );
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    select: { orderId: true },
  });
  if (!po) {
    return NextResponse.json({ error: "ไม่พบ PO" }, { status: 404 });
  }
  try {
    await assertOrderAccess(po.orderId, session);
  } catch {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ PO นี้" }, { status: 403 });
  }

  try {
    const result = await resolveAmbiguousErpResult({
      poNumber,
      resolution: parsed.data.resolution,
      note: parsed.data.note,
      actorEmail: session.email,
    });
    await recordAudit(session, "po.erpResolve", poNumber, {
      resolution: result.resolution === "in_erp" ? "เข้า ERP แล้ว" : "ไม่เข้า ERP — ส่งใหม่ได้",
      note: parsed.data.note,
      previousError: result.previousError,
    });
    // เข้าแล้วจริง = ร้านต้องได้แจ้งเตือน "เข้า ERP แล้ว" เหมือนส่งสำเร็จปกติ
    if (result.resolution === "in_erp") {
      await notifyErpSendResult({
        ok: true,
        poNumber,
        orderId: result.orderId,
        storeId: result.storeId,
        actorEmail: session.email,
      });
    }
    return NextResponse.json({ success: true, resolution: result.resolution });
  } catch (err) {
    if (err instanceof ErpResolveError) {
      const [status, error] = ERROR_TEXT[err.code];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
