import { redirect } from "next/navigation";
import { getSalesSession } from "@/lib/auth/sales-session";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSalesSession();
  if (!session) redirect("/login?mode=sales");
  return children;
}
