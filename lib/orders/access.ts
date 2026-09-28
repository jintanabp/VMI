import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SalesSession } from "@/lib/auth/sales-session";
import { getPersonSalesCodes } from "@/lib/admin/vda-sales-directory";
import {
  getVdaAosBillRegistry,
  isVdaStoreCode,
} from "@/lib/fabric/vda-aos-bill";

function normSalesman(code: string) {
  return code.trim().toUpperCase();
}

function salesmanCanAccessVda(
  session: SalesSession,
  vdaCode: string,
  options?: { allPersonCodes?: boolean }
): boolean {
  const registry = getVdaAosBillRegistry();
  const vda = vdaCode.trim().toLowerCase();

  const codes = new Set<string>();
  if (session.salesmanCode) codes.add(normSalesman(session.salesmanCode));
  for (const c of session.scopeSalesmanCodes ?? []) {
    codes.add(normSalesman(c));
  }

  if (options?.allPersonCodes && session.role === "sales") {
    // รหัสที่แอดมินกำหนดแทนที่รหัสอัตโนมัติ — ไม่งั้นเอาอีเมลออกจากรหัสเดิมแล้วยังเห็นออเดอร์รหัสนั้นอยู่
    for (const c of getPersonSalesCodes(session.email, session.manualCodes)) {
      codes.add(normSalesman(c.code));
    }
  }

  for (const sm of codes) {
    if (registry.getVdasForSalesman(sm).includes(vda)) return true;
  }
  return false;
}

export async function assertOrderAccess(
  orderId: string,
  session: SalesSession
): Promise<void> {
  if (session.role === "admin") return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { store: { select: { code: true } } },
  });

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const storeCode = order.store.code;

  // ตัดสินจาก รหัสที่ผูกกับอีเมล → VDA อย่างเดียว (QA 28 ก.ย. 69) · เดิมถ้าร้านไม่ใช่ VDA หรือทะเบียน VDA
  // ยังไม่โหลด จะถอยไปเทียบ `Store.salesRep` ซึ่งค้างเก่าได้ = คนผิดคนเข้าออเดอร์ได้ · ตอนนี้ปิดไว้ก่อน (fail closed)
  if (!isVdaStoreCode(storeCode) || !getVdaAosBillRegistry().isLoaded) {
    throw new Error("FORBIDDEN");
  }
  if (salesmanCanAccessVda(session, storeCode)) return;
  if (
    session.role === "sales" &&
    salesmanCanAccessVda(session, storeCode, { allPersonCodes: true })
  ) {
    return;
  }
  throw new Error("FORBIDDEN");
}

export function resolveSalesmanCodesForFilter(
  session: SalesSession
): string[] {
  if (session.role === "admin") return [];

  const codes = new Set<string>();
  if (session.salesmanCode) codes.add(normSalesman(session.salesmanCode));
  for (const c of session.scopeSalesmanCodes ?? []) {
    codes.add(normSalesman(c));
  }
  return [...codes];
}

export function resolveVdaCodesForSalesmanCodes(
  salesmanCodes: string[]
): string[] {
  const registry = getVdaAosBillRegistry();
  const vdas = new Set<string>();
  for (const sm of salesmanCodes) {
    for (const vda of registry.getVdasForSalesman(sm)) {
      vdas.add(vda.toLowerCase());
    }
  }
  return [...vdas];
}

export function resolveAllPersonVdaCodes(
  email: string,
  /** session.manualCodes — มี = ใช้เฉพาะรหัสที่แอดมินกำหนด */
  manualCodes?: string[]
): string[] {
  const vdas = new Set<string>();
  for (const c of getPersonSalesCodes(email, manualCodes)) {
    for (const vda of c.vdas) {
      vdas.add(vda.toLowerCase());
    }
  }
  return [...vdas].sort();
}

/**
 * เงื่อนไข Prisma ของ "ร้านที่ออเดอร์ของคนนี้อยู่" — ใช้กับ count/groupBy
 *
 * ลำดับต้องตรงกับที่ `GET /api/orders` ใช้เลือกลิสต์ (route.ts) เป๊ะ ไม่งั้นตัวเลข
 * สรุปกับลิสต์ที่กดเข้าไปดูจะไม่ตรงกัน: มี VDA → กรองด้วย VDA เท่านั้น ·
 * ไม่มี VDA + เป็น sales → ไม่เห็นอะไรเลย · ไม่มี VDA + หัวหน้า → กรองด้วยอีเมลลูกทีม
 *
 * คืน `null` = ไม่มีสิทธิ์ (ผู้เรียกตอบ 401) · `{}` = เห็นทุกร้าน (admin)
 * `"none"` = ล็อกอินถูกต้องแต่ไม่มีร้านในความดูแล (ผู้เรียกตอบ 0 โดยไม่ต้อง query)
 */
export function resolveOrderStoreScope(
  session: SalesSession | null
): Prisma.StoreWhereInput | "none" | null {
  if (!session) return null;
  if (session.role === "admin") return {};

  const email = session.email.toLowerCase();
  const salesmanCodes = resolveSalesmanCodesForFilter(session);
  let vdas = resolveVdaCodesForSalesmanCodes(salesmanCodes);
  if (vdas.length === 0 && session.role === "sales") {
    vdas = resolveAllPersonVdaCodes(email, session.manualCodes);
  }

  // ไม่มี VDA = ไม่เห็นอะไร ทุก role (เดิม manager/supervisor ถอยไปใช้ Store.salesRep — role นี้ไม่มีแล้ว)
  return vdas.length > 0 ? { code: { in: vdas } } : "none";
}
