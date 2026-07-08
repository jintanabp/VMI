import { redirect } from "next/navigation";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { getStoreSession } from "@/lib/auth/store-session";
import { ManageClient } from "@/components/manage/manage-client";

export default async function ManagePage() {
  const store = await getCustomerStoreFromCookie();
  if (!store) redirect("/login?mode=customer");

  const session = await getStoreSession();
  const canManage = session?.canManageMinMax ?? false;

  return (
    <ManageClient
      storeCode={store.code}
      storeName={store.name}
      storeAddress={store.addressName}
      isVda={store.isVda}
      email={session?.email ?? ""}
      canManage={canManage}
    />
  );
}
