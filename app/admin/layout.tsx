import { redirect } from "next/navigation";
import { getRawSalesSession } from "@/lib/auth/sales-session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRawSalesSession();
  if (!session) redirect("/login?mode=sales");
  if (session.role !== "admin") redirect("/sales/orders");
  return children;
}
