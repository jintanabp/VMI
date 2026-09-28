import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { buildVdaSalesDirectory } from "@/lib/admin/vda-sales-directory";
import { prisma } from "@/lib/prisma";
import { can, isCreator } from "@/lib/auth/permissions";

export async function GET() {
  const session = await getRawSalesSession();
  if (!can(session, "salesCodes.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // อีเมลอ้างอิงที่แอดมินกำหนด — ให้รหัสที่ไม่มีใน cross_salesman มีเจ้าของในตารางด้วย
  const manual = await prisma.salesmanEmailAssignment.findMany({
    where: { active: true },
    select: { id: true, email: true, salesmanCode: true },
  });
  return NextResponse.json({
    ...buildVdaSalesDirectory(manual),
    // หน้าเว็บใช้ซ่อนปุ่ม — ตัวตัดสินจริงอยู่ที่ /api/admin/salesman-assignments
    canAddEmail: can(session, "salesCodes.addEmail"),
    canRemoveEmail: isCreator(session),
  });
}
