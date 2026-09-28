import { redirect } from "next/navigation";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  STAFF_ADMIN_SETTINGS_HOME,
  hasSettingsAccess,
  homePathFor,
  isCreator,
} from "@/lib/auth/permissions";

/**
 * กันทั้งหมวดของหน้าตั้งค่าให้ creator เท่านั้น — ใช้ใน layout.tsx ของหมวดนั้น
 * admin ที่เปิด URL ตรง ๆ (หรือ /admin ที่ redirect มาหน้า Sync) ถูกพาไปแท็บแรกที่ตัวเองเห็น
 * API ของหมวดเหล่านี้ตรวจ role "admin" (= creator) อยู่แล้ว ชั้นนี้กันหน้าเปล่า/403 ให้เห็น
 */
export async function CreatorOnlyLayout({ children }: { children: React.ReactNode }) {
  const session = await getRawSalesSession();
  if (!session) redirect("/login?mode=sales");
  if (!isCreator(session)) {
    redirect(hasSettingsAccess(session) ? STAFF_ADMIN_SETTINGS_HOME : homePathFor(session));
  }
  return <>{children}</>;
}
