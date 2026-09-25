import { prisma } from "@/lib/prisma";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeSalesmanCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * รหัสเซลล์ (SXXX) ที่แอดมินกำหนดทับให้อีเมลนี้ใช้ได้ — ว่าง = ไม่มีการกำหนดทับ
 * ให้ผู้เรียก fallback ไปใช้ผลอัตโนมัติจาก cross_target เหมือนเดิม
 */
export async function getManualSalesmanCodes(email: string): Promise<string[]> {
  const rows = await prisma.salesmanEmailAssignment.findMany({
    where: { email: normalizeEmail(email), active: true },
    select: { salesmanCode: true },
  });
  return rows.map((r) => normalizeSalesmanCode(r.salesmanCode));
}
