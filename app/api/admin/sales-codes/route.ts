import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { isCreator } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { buildVdaSalesDirectory } from "@/lib/admin/vda-sales-directory";

export const dynamic = "force-dynamic";

export interface SalesCodeOption {
  code: string;
  vdas: string[];
  emails: string[];
}

/**
 * ตัวเลือก "กรองตามรหัสเซลล์" ในหน้าออเดอร์ของ creator — เฉพาะรหัสที่ดูแลคลังอยู่
 *
 * แทน `/api/admin/salesmen` เดิมที่อ่าน `Store.salesRep` (เก็บได้อีเมลเดียวต่อร้าน เลือกคนที่ผูกก่อนสุด
 * รหัสที่ผูกหลายอีเมลจึงกรองไม่ตรง) · ตอนนี้ รหัส → คลัง ตามทะเบียน VDA กฎเดียวกับสิทธิ์ของเซลล์
 */
export async function GET() {
  const session = await getRawSalesSession();
  if (!isCreator(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const manual = await prisma.salesmanEmailAssignment.findMany({
    where: { active: true },
    select: { id: true, email: true, salesmanCode: true },
  });
  const options: SalesCodeOption[] = buildVdaSalesDirectory(manual)
    .codes.filter((c) => c.vdas.length > 0)
    .map((c) => ({ code: c.code, vdas: c.vdas, emails: c.manual.map((m) => m.email) }));
  return NextResponse.json(options);
}
