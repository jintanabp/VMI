import { AdminShell } from "@/components/admin/admin-shell";
import { AuditLogSection } from "@/components/admin/audit-log-section";

export default function AdminSystemAuditPage() {
  return (
    <AdminShell
      title="บันทึกการทำงาน"
      description="ใครทำอะไรในหน้าตั้งค่า ใครลบออเดอร์ และใครแก้สถานะ ERP เมื่อไหร่"
    >
      <AuditLogSection />
    </AdminShell>
  );
}
