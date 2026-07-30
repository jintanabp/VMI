import { AdminShell } from "@/components/admin/admin-shell";
import { SalesPreviewPanel } from "@/components/admin/sales-preview-panel";

export default function AdminSalesPage() {
  return (
    <AdminShell
      title="มุมมองเซลล์"
      description="เปิดหน้าตรวจออเดอร์ในมุมมองของเซลล์แต่ละคน (scope เดียวกับที่เขา login จริง)"
    >
      <SalesPreviewPanel />
    </AdminShell>
  );
}
