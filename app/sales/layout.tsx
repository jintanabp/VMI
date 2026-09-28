import { redirect } from "next/navigation";
import { getSalesSession } from "@/lib/auth/sales-session";
import { hasSalesView, homePathFor } from "@/lib/auth/permissions";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSalesSession();
  if (!session) redirect("/login?mode=sales");
  // admin ที่ creator ไม่ได้ตั้งให้เป็นเซลล์ มีแต่หน้าตั้งค่า
  if (!hasSalesView(session)) redirect(homePathFor(session));
  return children;
}
