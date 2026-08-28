import type { Store } from "@prisma/client";
import { getCustomerDirectory, fabricMastersReady, fabricStockReady } from "@/lib/fabric";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { resolveVdaStoreName } from "@/lib/fabric/vda-store-name";
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
    // ถ้า map vda → customercode ได้ ใช้ชื่อร้านจาก dim_customer แทนรหัสเปล่า
    const vdaName = resolveVdaStoreName(store.code);
    return {
      id: store.id,
      code: store.code,
      name: vdaName || store.code.toUpperCase(),
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

/**
 * ร้านของ session ปัจจุบัน — ถ้า id ไม่ตรง DB (เช่นหลัง reseed) จะลบ cookie แล้วคืน null
 *
 * ตัวตนมาจาก `getAuthorizedStore()` (session ที่เซ็นแล้ว) ไม่ใช่ cookie ดิบ
 * ไม่งั้นตั้ง `vmi_store_id` เป็นร้านอื่นแล้วเปิดหน้าร้านนั้นได้เลย
 */
export async function getCustomerStoreFromCookie(): Promise<CustomerStoreContext | null> {
  const { getAuthorizedStore } = await import("./store-context");
  const authorized = await getAuthorizedStore();
  if (!authorized) return null;
  const { storeId, storeCode } = authorized;

  const { stock } = getRepositories();
  const stores = await stock.getStores();

  const store =
    stores.find((s) => s.id === storeId) ??
    stores.find((s) => s.code === storeCode) ??
    (storeCode ? await stock.getStoreByCode(storeCode) : null);

  // ห้ามลบ cookie ที่นี่ — ฟังก์ชันนี้ทำงานระหว่าง render ของ server component
  // การแก้ cookie นอก Server Action ทำให้ Next โยน error แล้วหน้าขึ้น 500
  // (เคสจริง: reseed ฐานข้อมูลแล้ว id ใน cookie ไม่ตรงกับร้านไหนเลย)
  if (!store) return null;

  return enrichFromFabric(store as Store);
}
