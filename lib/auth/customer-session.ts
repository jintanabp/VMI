import type { Store } from "@prisma/client";
import { getCustomerDirectory, fabricMastersReady, fabricStockReady } from "@/lib/fabric";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { getRepositories } from "@/lib/repositories";
import {
  CUSTOMER_STORE_CODE_COOKIE,
  CUSTOMER_STORE_COOKIE,
} from "./roles";

export interface CustomerStoreContext {
  id: string;
  code: string;
  name: string;
  addressName: string;
  /** true เมื่อ session เป็นการเลือก VDA (from_db) แทนร้านค้า */
  isVda?: boolean;
}

export async function clearCustomerStoreCookies() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_STORE_COOKIE);
  cookieStore.delete(CUSTOMER_STORE_CODE_COOKIE);
}

function isVdaCode(code: string): boolean {
  if (!fabricStockReady()) return false;
  const sources = listStockFromDbSources();
  return sources.some((s) => s.toLowerCase() === code.toLowerCase());
}

function enrichFromFabric(store: Store): CustomerStoreContext {
  if (isVdaCode(store.code)) {
    return {
      id: store.id,
      code: store.code,
      name: store.code.toUpperCase(),
      addressName: "คลัง VDA",
      isVda: true,
    };
  }

  const fabric = fabricMastersReady()
    ? getCustomerDirectory().getByCode(store.code)
    : null;

  return {
    id: store.id,
    code: store.code,
    name: fabric?.name || store.name,
    addressName: fabric?.address || "",
    isVda: false,
  };
}

/** อ่าน cookie ร้านค้า — ถ้า id ไม่ตรง DB (เช่นหลัง reseed) จะลบ cookie แล้วคืน null */
export async function getCustomerStoreFromCookie(): Promise<CustomerStoreContext | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;
  const storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value;
  if (!storeId && !storeCode) return null;

  const { stock } = getRepositories();
  const stores = await stock.getStores();

  const store =
    stores.find((s) => s.id === storeId) ??
    stores.find((s) => s.code === storeCode) ??
    (storeCode ? await stock.getStoreByCode(storeCode) : null);

  if (!store) {
    await clearCustomerStoreCookies();
    return null;
  }

  return enrichFromFabric(store as Store);
}
