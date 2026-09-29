import { NextResponse } from "next/server";
import { getRawSalesSession, type SalesSession } from "@/lib/auth/sales-session";
import { auditSkuCodes, recordAudit } from "@/lib/admin/audit-log";
import { prisma } from "@/lib/prisma";
import {
  applyThresholdPatch,
  listGroupThresholds,
} from "@/lib/stock/thresholds-service";

export const dynamic = "force-dynamic";

/** เป้าหมายใน audit log เป็นรหัสร้านที่คนอ่านออก ไม่ใช่ cuid */
async function storeCodeOf(storeId: string): Promise<string> {
  const s = await prisma.store.findUnique({ where: { id: storeId }, select: { code: true } });
  return s?.code ?? storeId;
}

/**
 * MIN/MAX ต่อร้านสำหรับแอดมิน — ใช้ service ตัวเดียวกับฝั่งร้านค้า
 * เดิมแอดมินไม่มีหน้านี้เลย ต้อง impersonate ร้านผ่านแท็บ "มุมมอง VDA" เท่านั้น
 * (ทั้ง ๆ ที่ manage-client บอกผู้ใช้ให้ "ติดต่อแอดมิน")
 */
async function requireAdminAndStore(request: Request): Promise<
  | { ok: true; storeId: string; session: SalesSession }
  | { ok: false; res: NextResponse }
> {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId")?.trim();
  const storeCode = searchParams.get("storeCode")?.trim().toLowerCase();

  if (storeId) {
    const exists = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!exists) {
      return {
        ok: false,
        res: NextResponse.json({ error: "ไม่พบร้านค้านี้" }, { status: 404 }),
      };
    }
    return { ok: true, storeId, session };
  }

  if (storeCode) {
    const store = await prisma.store.findUnique({
      where: { code: storeCode },
      select: { id: true },
    });
    if (!store) {
      return {
        ok: false,
        res: NextResponse.json({ error: "ไม่พบร้านค้านี้" }, { status: 404 }),
      };
    }
    return { ok: true, storeId: store.id, session };
  }

  return {
    ok: false,
    res: NextResponse.json(
      { error: "ต้องระบุ storeId หรือ storeCode" },
      { status: 400 }
    ),
  };
}

export async function GET(request: Request) {
  const guard = await requireAdminAndStore(request);
  if (!guard.ok) return guard.res;
  return NextResponse.json({
    storeId: guard.storeId,
    groups: await listGroupThresholds(guard.storeId),
  });
}

export async function PATCH(request: Request) {
  const guard = await requireAdminAndStore(request);
  if (!guard.ok) return guard.res;
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await applyThresholdPatch(
    guard.storeId,
    body
  );
  if (status < 300) {
    await recordAudit(guard.session, "thresholds.update", await storeCodeOf(guard.storeId), body.reset
      ? { scope: `คืนค่าเริ่มต้น กลุ่ม ${String(body.section ?? "")}` }
      : {
          scope: body.skuId
            ? `สินค้า ${(await auditSkuCodes(body.skuId)).join(", ")}`
            : Array.isArray(body.sections)
              ? `กลุ่ม ${body.sections.map(String).join(", ")}`
              : `กลุ่ม ${String(body.section ?? "")}`,
          minDays: body.minDays,
          maxDays: body.maxDays,
        });
  }
  return NextResponse.json(payload, { status });
}
