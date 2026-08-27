import { redirect } from "next/navigation";
import { ADMIN_GROUPS } from "@/lib/admin/admin-nav";

/** เข้าหมวดเปล่า ๆ = ไปแท็บย่อยแรกของหมวดนั้น */
export default function AdminDataIndexPage() {
  redirect(ADMIN_GROUPS.find((g) => g.key === "data")!.subTabs[0].href);
}
