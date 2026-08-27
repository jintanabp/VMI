import { redirect } from "next/navigation";
import { ADMIN_GROUPS } from "@/lib/admin/admin-nav";

/** เข้าหมวดเปล่า ๆ = ไปแท็บย่อยแรกของหมวดนั้น */
export default function AdminPromotionsIndexPage() {
  redirect(ADMIN_GROUPS.find((g) => g.key === "promotions")!.subTabs[0].href);
}
