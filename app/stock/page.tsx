import { redirect } from "next/navigation";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { StockPageClient } from "@/components/stock/stock-page-client";

export default async function StockPage() {
  const store = await getCustomerStoreFromCookie();

  if (!store) redirect("/login?mode=customer");

  return (
    <StockPageClient
      storeCode={store.code}
      storeName={store.name}
      storeAddress={store.addressName}
      isVda={store.isVda}
    />
  );
}
