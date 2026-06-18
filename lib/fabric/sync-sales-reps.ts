import { prisma } from "@/lib/prisma";
import { getSalesmanRegistry } from "@/lib/fabric";

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

/** อัปเดต SalesRep ใน SQLite จาก cross_salesman_reference_email (อีเมลจริง) */
export async function syncFabricSalesReps(): Promise<number> {
  const registry = getSalesmanRegistry();
  if (!registry.isLoaded) return 0;

  let count = 0;
  for (const assignment of registry.listCurrentAssignments()) {
    const name = registry.getDisplayName(assignment);
    await prisma.salesRep.upsert({
      where: { email: assignment.email },
      create: { email: assignment.email, name },
      update: { name },
    });
    count++;
  }
  return count;
}

function stableIndex(key: string, size: number): number {
  if (size <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % size;
}

/**
 * ผูกร้านกับเซลล์ — ยังไม่มี master customer→salesman ใน Fabric/ocr-po-matching
 * จึงใช้การกระจายแบบคงที่จากรหัสร้าน (ทดสอบได้จนกว่าจะมี Territory table)
 */
export async function ensureStoreSalesRep(
  storeId: string,
  customerCode: string
): Promise<string | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return null;
  if (store.salesRepId) return store.salesRepId;

  await syncFabricSalesReps();
  const reps = await prisma.salesRep.findMany({ orderBy: { email: "asc" } });
  if (reps.length === 0) return null;

  // จำกัดการผูกร้านกับ “เซลล์ที่อนุญาต” เท่านั้น (Allowlist)
  const allowedRows = await prisma.allowedSalesCode.findMany({
    select: { code: true },
  });
  const allowed = new Set(allowedRows.map((r) => normalizeCode(r.code)));

  const registry = getSalesmanRegistry();
  const eligible =
    allowed.size === 0
      ? reps
      : reps.filter((r) => {
          const a = registry.getCurrentByEmail(r.email);
          return !!a?.code && allowed.has(normalizeCode(a.code));
        });

  if (eligible.length === 0) return null;

  const pick = eligible[stableIndex(customerCode, eligible.length)];
  await prisma.store.update({
    where: { id: storeId },
    data: { salesRepId: pick.id },
  });
  return pick.id;
}
