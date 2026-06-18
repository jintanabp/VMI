import { redirect } from "next/navigation";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { OrderPageClient } from "@/components/order/order-page-client";

export default async function OrderPage() {
  const store = await getCustomerStoreFromCookie();

  if (!store) redirect("/login?mode=customer");

  return (
    <OrderPageClient
      storeCode={store.code}
      storeName={store.name}
      storeAddress={store.addressName}
      isVda={store.isVda}
    />
  );
}
