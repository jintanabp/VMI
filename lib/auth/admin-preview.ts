import { cookies } from "next/headers";
import { clearCustomerStoreCookies } from "./customer-session";
import { ADMIN_PREVIEW_COOKIE } from "./admin-preview-cookie";

export { ADMIN_PREVIEW_COOKIE };

export async function setAdminPreviewCookie() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PREVIEW_COOKIE, "1", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminPreviewCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_PREVIEW_COOKIE);
}

export async function isAdminPreview(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_PREVIEW_COOKIE)?.value === "1";
}

/** ออกจากโหมดทดสอบร้านค้า — ลบ cookie ร้านค้า แต่คง session เซลล์/admin */
export async function exitAdminPreview() {
  await clearCustomerStoreCookies();
  await clearAdminPreviewCookie();
}
