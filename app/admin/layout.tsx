import { redirect } from "next/navigation";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { hasSettingsAccess, homePathFor } from "@/lib/auth/permissions";

/**
 * ด่านแรกของหน้าตั้งค่า: creator หรือ admin เข้าได้ · แท็บที่ creator เท่านั้นถูกกันอีกชั้นที่
 * layout ของหมวด (`CreatorOnlyLayout`) เพราะ layout นี้ไม่ render ใหม่ตอนสลับหน้าฝั่ง client
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRawSalesSession();
  if (!session) redirect("/login?mode=sales");
  if (!hasSettingsAccess(session)) redirect(homePathFor(session));
  return children;
}
