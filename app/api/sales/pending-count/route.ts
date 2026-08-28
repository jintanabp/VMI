import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import { countPendingOrders } from "@/lib/sales/dashboard-queries";
import { resolveOrderStoreScope } from "@/lib/orders/access";

export const dynamic = "force-dynamic";

/**
 * จำนวนออเดอร์รอตรวจ สำหรับ badge บนแถบเมนู
 *
 * เดิม sales-nav ดึงลิสต์ออเดอร์ทั้งหมด (พร้อม items ทุกแถว) มานับ `.length`
 * ทุก 60 วินาที ต่อแท็บที่เปิด — เปลี่ยนมาใช้ COUNT ฝั่งฐานข้อมูล
 * scope resolve ด้วย lib/orders/access ตัวเดียวกับลิสต์ เพื่อให้ badge กับหน้าจอไม่ขัดกัน
 * และ /api/sales/dashboard เรียก countPendingOrders ตัวเดียวกันนี้ ตัวเลขจึงตรงกันเสมอ
 */
export async function GET() {
  const scope = resolveOrderStoreScope(await getSalesSession());
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (scope === "none") {
    return NextResponse.json({ pending: 0, priceFlagged: 0 });
  }

  return NextResponse.json(await countPendingOrders(prisma, scope));
}
