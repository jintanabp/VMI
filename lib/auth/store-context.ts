import { cookies } from "next/headers";
import { getStoreSession } from "./store-session";
import { getRawSalesSession } from "./sales-session";
import {
  CUSTOMER_STORE_COOKIE,
  CUSTOMER_STORE_CODE_COOKIE,
} from "./roles";

export interface AuthorizedStore {
  storeId: string;
  /** รหัส VDA/ร้าน (lowercase ตามที่ตั้งตอน login) — null ได้เมื่อ cookie รหัสหาย */
  storeCode: string | null;
  /** true เมื่อเป็นแอดมินเข้าดูร้าน ไม่ใช่ตัวร้านเอง */
  viaAdminPreview: boolean;
}

/**
 * ตัวตนร้านที่เชื่อถือได้ — ใช้แทนการอ่าน cookie `vmi_store_id` ตรงๆ
 *
 * `vmi_store_id` เป็น cuid ดิบไม่ได้เซ็น httpOnly กัน JS ได้แต่ไม่กัน HTTP request
 * ที่ประกอบเอง ใครก็ตั้ง cookie เป็น id ร้านอื่นแล้วอ่าน/แก้ข้อมูลร้านนั้นได้
 * จึงต้องยืนยันจาก session ที่เซ็นแล้วเท่านั้น:
 *   1. StoreSession (ร้าน login ด้วยอีเมล+รหัสผ่าน) — ตัวตนอยู่ใน token ที่เซ็น
 *   2. แอดมินตัวจริง (sales session เซ็นแล้ว role=admin) จึงเชื่อ cookie ได้ — โหมดเข้าดูร้าน
 *      ห้ามใช้ ADMIN_PREVIEW_COOKIE ตัดสิน มันเป็นค่า "1" ที่ httpOnly:false ปลอมได้
 *   3. นอกนั้น = ไม่มีสิทธิ์
 */
export async function getAuthorizedStore(): Promise<AuthorizedStore | null> {
  const session = await getStoreSession();
  if (session) {
    return {
      storeId: session.storeId,
      storeCode: session.vdaCode ?? null,
      viaAdminPreview: false,
    };
  }

  const salesSession = await getRawSalesSession();
  if (salesSession?.role === "admin") {
    const cookieStore = await cookies();
    const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;
    if (!storeId) return null;
    return {
      storeId,
      storeCode: cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value ?? null,
      viaAdminPreview: true,
    };
  }

  return null;
}

/** สั้นๆ เมื่อต้องการแค่ id */
export async function getAuthorizedStoreId(): Promise<string | null> {
  const store = await getAuthorizedStore();
  return store?.storeId ?? null;
}
