import { redirect } from "next/navigation";
import { ADMIN_LEGACY_REDIRECTS } from "@/lib/admin/admin-nav";

/** URL เดิมก่อนจัดหมวดใหม่ — คง redirect ไว้ให้ลิงก์ที่ส่งกันไว้และ bookmark เก่าใช้ได้ */
export default function AdminPromoLegacyPage() {
  redirect(ADMIN_LEGACY_REDIRECTS["/admin/promo"]);
}
