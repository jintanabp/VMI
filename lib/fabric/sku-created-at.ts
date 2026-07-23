import { prisma } from "@/lib/prisma";

/** สินค้าถือว่า "ใหม่" ถ้า Sku.createdAt อยู่ภายในกี่วันล่าสุด (default 30) */
export function getNewProductDays(): number {
  return Math.max(0, Number(process.env.NEW_PRODUCT_DAYS ?? 30) || 30);
}

/** createdAt ที่พ้นหน้าต่างป้ายใหม่ — ใช้ตอน bulk seed/catch-up */
export function backdatedSkuCreatedAt(days = getNewProductDays()): Date {
  return new Date(Date.now() - (days + 1) * 86_400_000);
}

/**
 * bulk create ไม่ควรติดป้าย "ใหม่" ทั้งกระดาน
 * - ตารางว่าง / seed ครั้งแรก
 * - หรือกำลังสร้างทีละมาก (login sync / catch-up ข้าม VDA)
 */
export function shouldBackdateSkuCreates(
  existingTotal: number,
  creatingCount: number
): boolean {
  if (creatingCount <= 0) return false;
  if (existingTotal === 0) return true;
  const bulkFloor = Math.max(50, Math.ceil(existingTotal * 0.2));
  return creatingCount >= bulkFloor;
}

let repairCheckedThisProcess = false;

/**
 * ซ่อม install ที่เคย sync แล้วทุกตัวขึ้นป้ายใหม่พร้อมกัน
 * (เช่น syncStockCoverForStore upsert ก่อน ensureSkus backdate)
 * ทำงานเมื่อสัดส่วน "ใหม่" ≥ 50% ของแคตตาล็อก — ของจริงไม่น่าถึง
 * เช็คครั้งเดียวต่อ process
 */
export async function repairAnomalousNewSkus(): Promise<number> {
  if (repairCheckedThisProcess) return 0;
  repairCheckedThisProcess = true;

  const days = getNewProductDays();
  if (days <= 0) return 0;

  const total = await prisma.sku.count();
  if (total < 50) return 0;

  const cutoff = new Date(Date.now() - days * 86_400_000);
  const newCount = await prisma.sku.count({
    where: { createdAt: { gte: cutoff } },
  });
  if (newCount / total < 0.5) return 0;

  const result = await prisma.sku.updateMany({
    where: { createdAt: { gte: cutoff } },
    data: { createdAt: backdatedSkuCreatedAt(days) },
  });

  if (result.count > 0) {
    console.warn(
      `[Sku] Repaired ${result.count}/${total} SKUs wrongly marked new (bulk createdAt)`
    );
  }
  return result.count;
}

/** สำหรับสคริปต์ซ่อมมือ — บังคับให้เช็คอีกครั้ง */
export function resetRepairAnomalousNewSkusGuard() {
  repairCheckedThisProcess = false;
}
