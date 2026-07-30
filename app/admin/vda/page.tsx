import { AdminShell } from "@/components/admin/admin-shell";
import { VdaPreviewPanel } from "@/components/admin/vda-preview-panel";

export default function AdminVdaPage() {
  return (
    <AdminShell
      title="มุมมอง VDA"
      description="เปิดหน้าร้านค้าในมุมมองของคลัง VDA เพื่อตรวจสอบข้อมูลที่ผู้ใช้เห็นจริง"
    >
      <VdaPreviewPanel />
    </AdminShell>
  );
}
