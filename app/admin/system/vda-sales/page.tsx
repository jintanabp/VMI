import { AdminShell } from "@/components/admin/admin-shell";
import { VdaSalesAccessPanel } from "@/components/admin/vda-sales-access-panel";
import { SalesmanAssignmentPanel } from "@/components/admin/salesman-assignment-panel";

export default function AdminSystemVdaSalesPage() {
  return (
    <AdminShell
      title="สิทธิ์เซลล์-VDA"
      description="เซลล์คนไหนดูแลคลังไหน — ปกติจับคู่อัตโนมัติจาก cross_target แอดมินกำหนดทับเองได้ด้านล่าง"
    >
      <div className="space-y-4">
        <SalesmanAssignmentPanel />
        <VdaSalesAccessPanel />
      </div>
    </AdminShell>
  );
}
