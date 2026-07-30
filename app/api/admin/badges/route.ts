import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import { readMasterRefreshStatus } from "@/lib/fabric/refresh-status";
import { fabricPromoReady } from "@/lib/fabric";

export const dynamic = "force-dynamic";

/**
 * ตัวเลขบนแท็บแอดมินในคำขอเดียว
 * เดิมทุกแท็บยิง /api/admin/store-accounts เองเพื่อนับเลขตัวเดียว (ยิงซ้ำ 2 ครั้งตอน mount)
 */
export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [pending, resetRequests] = await Promise.all([
    prisma.storeAccount.count({ where: { status: "pending" } }),
    prisma.storeAccount.count({
      where: { status: "approved", resetRequestedAt: { not: null } },
    }),
  ]);

  const status = readMasterRefreshStatus();
  const datasets = Object.values(status.datasets ?? {});
  // นับเฉพาะที่ "พยายามแล้วล้มเหลว" — ชุดที่ยังไม่ได้ตั้งค่า (skipped) ไม่ใช่ปัญหา
  const syncFailed = datasets.some((d) => !d.ok && !d.skipped);

  return NextResponse.json({
    storePending: pending + resetRequests,
    syncFailed,
    promoReady: fabricPromoReady(),
  });
}
