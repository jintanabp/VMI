import { AdminShell } from "@/components/admin/admin-shell";
import { VdaWarehousePanel } from "@/components/admin/vda-warehouse-panel";

export default function AdminDataWarehousesPage() {
  return (
    <AdminShell
      title="ทะเบียนคลัง VDA"
      description="กำหนดว่าคลังไหนคือลูกค้ารหัสอะไร — ค้นหารหัสจาก dim_customer ได้เลยถ้าไม่รู้"
    >
      <VdaWarehousePanel />
    </AdminShell>
  );
}
