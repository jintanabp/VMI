import { AdminShell } from "@/components/admin/admin-shell";
import { VdaSalesAccessPanel } from "@/components/admin/vda-sales-access-panel";

export default function AdminSystemVdaSalesPage() {
  return (
    <AdminShell
      title="สิทธิ์เซลล์-VDA"
      description="เซลล์คนไหนดูแลคลังไหน — อ่านจาก cross_target ไม่ได้กรอกมือ"
    >
      <VdaSalesAccessPanel />
    </AdminShell>
  );
}
