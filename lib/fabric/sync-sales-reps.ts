import { prisma } from "@/lib/prisma";
import { getSalesmanRegistry } from "@/lib/fabric";

/** อัปเดต SalesRep ใน SQLite จาก cross_salesman_reference_email (อีเมลจริง) */
export async function syncFabricSalesReps(): Promise<number> {
  const registry = getSalesmanRegistry();
  if (!registry.isLoaded) return 0;

  const assignments = registry.listCurrentAssignments();
  let count = 0;

  for (const a of assignments) {
    await prisma.salesRep.upsert({
      where: { email: a.email.toLowerCase() },
      create: {
        email: a.email.toLowerCase(),
        name: registry.getDisplayName(a),
      },
      update: { name: registry.getDisplayName(a) },
    });
    count++;
  }

  return count;
}

/**
 * @deprecated ใช้ vda_aos_bill mapping แทน — คงไว้เฉพาะร้าน non-VDA (ถ้ามี)
 */
export async function ensureStoreSalesRep(storeId: string): Promise<string | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return null;
  if (store.salesRepId) return store.salesRepId;

  await syncFabricSalesReps();
  const registry = getSalesmanRegistry();
  if (!registry.isLoaded) return null;

  const reps = await prisma.salesRep.findMany({ orderBy: { email: "asc" } });
  if (reps.length === 0) return null;

  const pick = reps[0];
  await prisma.store.update({
    where: { id: storeId },
    data: { salesRepId: pick.id },
  });
  return pick.id;
}
