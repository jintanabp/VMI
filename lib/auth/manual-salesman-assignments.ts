import { prisma } from "@/lib/prisma";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeSalesmanCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * รหัสเซลล์ (SXXX) ที่ผูกกับอีเมลนี้ — แหล่งเดียวของ "อีเมลนี้คือเซลล์รหัสไหน" ตั้งแต่เลิกใช้
 * cross_salesman master (28 ก.ย. 2569) · ว่าง = อีเมลนี้ไม่ใช่เซลล์
 */
export async function getManualSalesmanCodes(email: string): Promise<string[]> {
  const rows = await prisma.salesmanEmailAssignment.findMany({
    where: { email: normalizeEmail(email), active: true },
    select: { salesmanCode: true },
  });
  return [...new Set(rows.map((r) => normalizeSalesmanCode(r.salesmanCode)))];
}

