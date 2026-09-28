import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";

/**
 * ตัวเลือก "กรองตามเซลล์" ในหน้าออเดอร์ของ creator — SalesRep ที่ผูกกับร้าน VDA อยู่
 * รหัสของแต่ละคนมาจากอีเมลที่ผูกไว้ในหน้า «สิทธิ์เซลล์-VDA» (ไม่ใช้ cross_salesman แล้ว)
 */
export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [reps, links] = await Promise.all([
    prisma.salesRep.findMany({ orderBy: { name: "asc" } }),
    prisma.salesmanEmailAssignment.findMany({
      where: { active: true },
      select: { email: true, salesmanCode: true },
    }),
  ]);
  const codesByEmail = new Map<string, string[]>();
  for (const l of links) {
    const key = l.email.toLowerCase();
    codesByEmail.set(key, [...(codesByEmail.get(key) ?? []), l.salesmanCode.toUpperCase()]);
  }

  return NextResponse.json(
    reps
      .map((r) => {
        const codes = (codesByEmail.get(r.email.toLowerCase()) ?? []).sort();
        return {
          id: r.id,
          email: r.email,
          code: codes.join(", ") || r.email.split("@")[0],
          name: r.name,
          employeeNo: "",
        };
      })
      .sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
      )
  );
}
