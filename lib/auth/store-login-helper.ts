import { cookies } from "next/headers";
import type { StoreAccount } from "@prisma/client";
import { ensurePrismaStore } from "@/lib/repositories/store-helpers";
import { syncStockCoverForStore } from "@/lib/fabric/sync-stock-cover";
import { ensureVdaStoreSalesRep } from "@/lib/fabric/ensure-vda-sales-rep";
import { setStoreSessionCookie } from "./store-session";
import {
  CUSTOMER_STORE_COOKIE,
  CUSTOMER_STORE_CODE_COOKIE,
} from "./roles";

async function setCustomerCookies(storeId: string, code: string) {
  const cookieStore = await cookies();
  const common = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
  cookieStore.set(CUSTOMER_STORE_COOKIE, storeId, { httpOnly: true, ...common });
  cookieStore.set(CUSTOMER_STORE_CODE_COOKIE, code, {
    httpOnly: false,
    ...common,
  });
}

/** สร้าง Prisma store + sync + ตั้งคุกกี้ทั้ง customer และ store session หลัง login สำเร็จ */
export async function establishStoreSession(account: StoreAccount) {
  const code = account.vdaCode.trim().toLowerCase();
  const dbStore = await ensurePrismaStore(code, code.toUpperCase());
  await syncStockCoverForStore(dbStore.id, code);
  await ensureVdaStoreSalesRep(dbStore.id, code);

  await setCustomerCookies(dbStore.id, code);
  await setStoreSessionCookie({
    email: account.email,
    vdaCode: code,
    storeId: dbStore.id,
    canManageMinMax: account.canManageMinMax,
  });

  return dbStore;
}
