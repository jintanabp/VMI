import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPromoPanel } from "@/components/admin/admin-promo-panel";

export default function AdminPromoPage() {
  return (
    <AdminShell
      title="โปรโมชั่น C4"
      description="โปร C4 ที่ใช้ได้ในเดือน — กลุ่มโปร ขั้นบันได ของแถม และแถวที่ไม่มีสิทธิประโยชน์"
    >
      <AdminPromoPanel />
    </AdminShell>
  );
}
