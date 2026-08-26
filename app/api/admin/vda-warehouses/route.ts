import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  listVdaWarehousesAsync,
  saveVdaWarehouses,
} from "@/lib/fabric/vda-warehouse-registry";
import { reloadVdaAosBillRegistry } from "@/lib/fabric/vda-aos-bill";

export const dynamic = "force-dynamic";

/**
 * ทะเบียนคลัง VDA — "vda1 คือลูกค้ารหัสไหน"
 *
 * เคยอยู่ใน VDA_CUSTOMER_MAP ของ .env ซึ่งแปลว่าเปิดคลังใหม่ทีต้อง ssh เข้าเซิร์ฟเวอร์
 * แก้ไฟล์แล้ว restart ทั้งระบบ — งานที่แอดมินควรกดเองได้จากหน้าเว็บ
 */

const bodySchema = z.object({
  warehouses: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(32),
        // หลายรหัสได้ (คลังเดียวมีได้หลายบัญชีลูกค้า) — ฝั่ง UI ให้พิมพ์คั่นด้วย , หรือ |
        customerCodes: z.array(z.string().trim().min(1).max(32)).min(1),
        label: z.string().trim().max(120).optional(),
        active: z.boolean().optional(),
      })
    )
    .max(64),
});

export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ warehouses: await listVdaWarehousesAsync() });
}

export async function PUT(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง — ต้องมีรหัสคลังและรหัสลูกค้าอย่างน้อยหนึ่งรหัส" },
      { status: 400 }
    );
  }

  const codes = parsed.data.warehouses.map((w) => w.code.trim().toLowerCase());
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dup) {
    return NextResponse.json({ error: `รหัสคลังซ้ำ: ${dup}` }, { status: 400 });
  }

  const warehouses = await saveVdaWarehouses(parsed.data.warehouses);
  // ทะเบียนเซลล์ผูกกับรหัสลูกค้า — แก้รหัสลูกค้าแล้วต้องจับคู่เซลล์ใหม่ทันที
  // ไม่งั้นสิทธิ์ดูออเดอร์ของคลังที่เพิ่งแก้จะยังเป็นของเดิมจนกว่าจะ restart
  reloadVdaAosBillRegistry();

  return NextResponse.json({ success: true, warehouses });
}
