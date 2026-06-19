import { prisma } from "@/lib/prisma";
import { getSalesmanRegistry } from "./index";
import {
  getVdaAosBillRegistry,
  isVdaStoreCode,
} from "./vda-aos-bill";
import { syncFabricSalesReps } from "./sync-sales-reps";

function normSalesman(code: string) {
  return code.trim().toUpperCase();
}

/**
 * ผูก Store (VDA) กับ SalesRep จาก salesmancode ใน vda{N}_aos_bill
 */
export async function ensureVdaStoreSalesRep(
  storeId: string,
  vdaCode: string
): Promise<string | null> {
  if (!isVdaStoreCode(vdaCode)) return null;

  const salesmanCode = getVdaAosBillRegistry().getPrimarySalesmanForVda(vdaCode);
  if (!salesmanCode) {
    console.warn(`[VdaSalesRep] No salesman for ${vdaCode} — sync vda_aos_bill CSV`);
    return null;
  }

  await syncFabricSalesReps();
  const registry = getSalesmanRegistry();
  const assignment =
    registry.getCurrentByCode(salesmanCode) ??
    registry.getCurrentByCode(normSalesman(salesmanCode));

  if (!assignment?.email) {
    console.warn(
      `[VdaSalesRep] salesmancode ${salesmanCode} not in cross_salesman master`
    );
    return null;
  }

  const rep = await prisma.salesRep.upsert({
    where: { email: assignment.email.toLowerCase() },
    create: {
      email: assignment.email.toLowerCase(),
      name: registry.getDisplayName(assignment),
    },
    update: { name: registry.getDisplayName(assignment) },
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { salesRepId: rep.id },
  });

  return rep.id;
}
