import { AdminShell } from "@/components/admin/admin-shell";
import { AdminThresholdsPanel } from "@/components/admin/admin-thresholds-panel";

export default function AdminStoreThresholdsPage() {
  return (
    <AdminShell
      title="MIN/MAX & หยุดสั่ง"
      description="ตั้งค่าจำนวนวันสำรองรายกลุ่มสินค้า และดูรายการสินค้าที่หยุดสั่งของแต่ละคลัง"
    >
      <AdminThresholdsPanel />
    </AdminShell>
  );
}
