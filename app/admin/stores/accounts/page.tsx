import { AdminShell } from "@/components/admin/admin-shell";
import { StoreAccountsPanel } from "@/components/admin/store-accounts-panel";

export default function AdminStoreAccountsPage() {
  return (
    <AdminShell
      title="บัญชีร้านค้า"
      description="อนุมัติคำขอเข้าใช้งาน ผูก VDA ให้แต่ละบัญชี และรีเซ็ตรหัสผ่าน"
    >
      <StoreAccountsPanel />
    </AdminShell>
  );
}
