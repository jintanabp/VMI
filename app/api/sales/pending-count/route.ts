import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";

export const dynamic = "force-dynamic";

/**
 * จำนวนออเดอร์รอตรวจ สำหรับ badge บนแถบเมนู
 *
 * เดิม sales-nav ดึงลิสต์ออเดอร์ทั้งหมด (พร้อม items ทุกแถว) มานับ `.length`
 * ทุก 60 วินาที ต่อแท็บที่เปิด — เปลี่ยนมาใช้ COUNT ฝั่งฐานข้อมูล
 * scope resolve ด้วย lib/orders/access ตัวเดียวกับลิสต์ เพื่อให้ badge กับหน้าจอไม่ขัดกัน
 */
export async function GET() {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where: {
    status: string;
    store?: { code: { in: string[] } };
  } = { status: "pending_approval" };

  if (session.role !== "admin") {
    const codes = resolveSalesmanCodesForFilter(session);
    let allowed = resolveVdaCodesForSalesmanCodes(codes);
    if (allowed.length === 0 && session.role === "sales") {
      allowed = resolveAllPersonVdaCodes(session.email);
    }
    if (allowed.length === 0) {
      return NextResponse.json({ pending: 0, priceFlagged: 0 });
    }
    where.store = { code: { in: allowed } };
  }

  const [pending, priceFlagged] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({
      where: { ...where, items: { some: { priceFlagged: true } } },
    }),
  ]);

  return NextResponse.json({ pending, priceFlagged });
}
