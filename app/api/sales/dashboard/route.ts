import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSalesSession } from "@/lib/auth/sales-session";
import { resolveOrderStoreScope } from "@/lib/orders/access";
import {
  countOrdersByStatus,
  countPendingOrders,
  listFlagInputs,
  listRecentDecisions,
} from "@/lib/sales/dashboard-queries";
import {
  calcApprovalRate,
  rankRedFlagStores,
} from "@/lib/sales/dashboard-summary";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;

/**
 * สรุปภาพรวมของหน้า /sales — ยิงทีเดียวได้ครบทุกการ์ด
 *
 * ไม่สร้างบน `/api/orders` เพราะ route นั้นคืนออเดอร์ทั้งหมดพร้อม items และ Sku
 * แบบไม่แบ่งหน้า และ contract เป็น array เปล่า ๆ ไม่มีที่ห้อยค่าสรุป — การนับ
 * ธงแดงผ่านมันจะลากทั้งกราฟข้อมูลข้ามสายมาเพื่อนับเลขไม่กี่ตัว
 */
export async function GET(request: Request) {
  const scope = resolveOrderStoreScope(await getSalesSession());
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number(
    new URL(request.url).searchParams.get("days") ?? DEFAULT_WINDOW_DAYS
  );
  const windowDays = Number.isFinite(daysParam)
    ? Math.min(Math.max(Math.trunc(daysParam), 1), MAX_WINDOW_DAYS)
    : DEFAULT_WINDOW_DAYS;

  // ล็อกอินถูกต้องแต่ยังไม่มีร้านในความดูแล — ตอบศูนย์ ไม่ต้องแตะฐานข้อมูล
  if (scope === "none") {
    return NextResponse.json({
      pending: 0,
      priceFlagged: 0,
      approval: calcApprovalRate({}),
      topRedFlagStores: [],
      recentDecisions: [],
      windowDays,
    });
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [counts, byStatus, flagInputs, recentDecisions] = await Promise.all([
    countPendingOrders(prisma, scope),
    countOrdersByStatus(prisma, scope, since),
    listFlagInputs(prisma, scope, since),
    listRecentDecisions(prisma, scope),
  ]);

  return NextResponse.json({
    pending: counts.pending,
    priceFlagged: counts.priceFlagged,
    approval: calcApprovalRate({
      approved: byStatus.approved,
      rejected: byStatus.rejected,
    }),
    topRedFlagStores: rankRedFlagStores(flagInputs),
    recentDecisions,
    windowDays,
  });
}
