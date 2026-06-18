import type { Store } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fabricMastersReady, getCustomerDirectory } from "@/lib/fabric";

export function fabricStoreFromCode(code: string, name: string): Store {
  return { id: code, code, name, salesRepId: null };
}

export async function resolveStoreRecord(code: string): Promise<Store | null> {
  if (fabricMastersReady()) {
    const customer = getCustomerDirectory().getByCode(code);
    if (customer) {
      return fabricStoreFromCode(customer.code, customer.displayName || customer.name);
    }
  }

  return prisma.store.findUnique({ where: { code } });
}

export async function resolveStoreId(storeIdOrCode: string): Promise<string | null> {
  const byId = await prisma.store.findUnique({ where: { id: storeIdOrCode } });
  if (byId) return byId.id;

  const byCode = await prisma.store.findUnique({ where: { code: storeIdOrCode } });
  if (byCode) return byCode.id;

  if (fabricMastersReady()) {
    const customer = getCustomerDirectory().getByCode(storeIdOrCode);
    if (customer) {
      const store = await ensurePrismaStore(customer.code, customer.name);
      return store.id;
    }
  }

  return null;
}

/** Ensure a SQLite Store row exists for operational data (stock/orders). */
export async function ensurePrismaStore(code: string, name: string): Promise<Store> {
  return prisma.store.upsert({
    where: { code },
    create: { code, name },
    update: { name },
  });
}

export function listFabricStores(limit = 500): Store[] {
  return getCustomerDirectory()
    .listAll(limit)
    .map((c) => fabricStoreFromCode(c.code, c.displayName || c.name));
}
