import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SalesSession } from "@/lib/auth/sales-session";
import { getPersonSalesCodes } from "@/lib/admin/vda-sales-directory";
import { getSalesmanRegistry } from "@/lib/fabric";
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
    for (const a of getSalesmanRegistry().getAssignmentsByEmail(session.email)) {
      codes.add(normSalesman(a.code));
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
    include: { store: { include: { salesRep: true } } },
  });

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const storeCode = order.store.code;

  if (isVdaStoreCode(storeCode) && getVdaAosBillRegistry().isLoaded) {
    if (salesmanCanAccessVda(session, storeCode)) return;
    if (
      session.role === "sales" &&
      salesmanCanAccessVda(session, storeCode, { allPersonCodes: true })
    ) {
      return;
    }
    throw new Error("FORBIDDEN");
  }

  const email = session.email.toLowerCase();
  const scope = new Set(
    (session.scopeEmails ?? [email]).map((e) => e.toLowerCase())
  );

  if (
    order.store.salesRep?.email &&
    scope.has(order.store.salesRep.email.toLowerCase())
  ) {
    return;
  }

  if (
    session.role === "sales" &&
    order.store.salesRep?.email?.toLowerCase() === email
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

export function resolveAllPersonVdaCodes(email: string): string[] {
  const vdas = new Set<string>();
  for (const c of getPersonSalesCodes(email)) {
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
    vdas = resolveAllPersonVdaCodes(email);
  }

  if (vdas.length > 0) return { code: { in: vdas } };
  if (session.role === "sales") return "none";

  const emails = (session.scopeEmails ?? [email]).map((e) => e.toLowerCase());
  return { salesRep: { is: { email: { in: emails } } } };
}

export function resolveSalesRepEmailsForFilter(
  session: SalesSession
): string[] {
  const registry = getSalesmanRegistry();
  const emails = new Set<string>();
  emails.add(session.email.toLowerCase());

  for (const code of resolveSalesmanCodesForFilter(session)) {
    const a = registry.getCurrentByCode(code);
    if (a?.email) emails.add(a.email.toLowerCase());
  }

  return [...emails];
}
