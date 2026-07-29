import { redirect } from "next/navigation";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { OrderHistoryClient } from "@/components/history/order-history-client";

export default async function HistoryPage() {
  const store = await getCustomerStoreFromCookie();

  if (!store) redirect("/login?mode=customer");

  return (
    <OrderHistoryClient
      storeCode={store.code}
      storeName={store.name}
      storeAddress={store.addressName}
      isVda={store.isVda}
    />
  );
}
