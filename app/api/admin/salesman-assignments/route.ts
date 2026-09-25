import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import { getSalesmanRegistry } from "@/lib/fabric";
import { getVdaAosBillRegistry } from "@/lib/fabric/vda-aos-bill";
import { listVdaWarehousesAsync } from "@/lib/fabric/vda-warehouse-registry";
import {
  normalizeEmail,
  normalizeSalesmanCode,
} from "@/lib/auth/manual-salesman-assignments";

export const dynamic = "force-dynamic";

/**
 * แอดมินกำหนดเองว่าอีเมลไหนเข้าใช้งานในฐานะรหัสเซลล์ (SXXX) ไหนได้บ้าง
 *
 * override การจับคู่อัตโนมัติจาก cross_target (lib/fabric/vda-aos-bill.ts) — ดู
 * lib/auth/manual-salesman-assignments.ts และ buildSalesSessionWithAccess()
 */

/** รหัสเดียวใส่ได้หลายอีเมล (`emails`) — `email` เดี่ยวยังรับอยู่เพื่อความเข้ากันได้ */
const createSchema = z
  .object({
    email: z.string().trim().email().max(120).optional(),
    emails: z.array(z.string().trim().email().max(120)).min(1).max(50).optional(),
    salesmanCode: z.string().trim().min(1).max(20),
  })
  .refine((v) => v.email || v.emails, { message: "ต้องมีอีเมลอย่างน้อย 1 รายการ" });

async function enrichRows() {
  const rows = await prisma.salesmanEmailAssignment.findMany({
    where: { active: true },
    orderBy: [{ email: "asc" }, { salesmanCode: "asc" }],
  });
  const salesmanReg = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();
  const warehouses = await listVdaWarehousesAsync();
  const labelByVda = new Map(warehouses.map((w) => [w.code, w.label]));

  return rows.map((r) => {
    const assignment = salesmanReg.getCurrentByCode(r.salesmanCode);
    const vdas = vdaReg.getVdasForSalesman(r.salesmanCode);
    return {
      id: r.id,
      email: r.email,
      salesmanCode: r.salesmanCode,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      salesmanName: assignment ? salesmanReg.getDisplayName(assignment) : null,
      foundInMaster: assignment != null,
      vdas: vdas.map((v) => ({ code: v, label: labelByVda.get(v) || "" })),
    };
  });
}

export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ assignments: await enrichRows() });
}

export async function POST(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง — ต้องมีอีเมลและรหัสเซลล์" },
      { status: 400 }
    );
  }

  const salesmanCode = normalizeSalesmanCode(parsed.data.salesmanCode);
  const emails = [
    ...new Set(
      [...(parsed.data.emails ?? []), ...(parsed.data.email ? [parsed.data.email] : [])].map(
        normalizeEmail
      )
    ),
  ];

  try {
    await prisma.$transaction(
      emails.map((email) =>
        prisma.salesmanEmailAssignment.upsert({
          where: { email_salesmanCode: { email, salesmanCode } },
          create: { email, salesmanCode, active: true, createdBy: session.email },
          update: { active: true, createdBy: session.email },
        })
      )
    );
  } catch {
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ assignments: await enrichRows() });
}

export async function DELETE(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  }

  await prisma.salesmanEmailAssignment.deleteMany({ where: { id } });
  return NextResponse.json({ assignments: await enrichRows() });
}
