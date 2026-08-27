import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEmailsSection } from "@/components/admin/admin-emails-section";

export default function AdminSystemAdminsPage() {
  return (
    <AdminShell title="ผู้ดูแลระบบ" description="ใครเข้าหน้า Admin ได้บ้าง">
      <AdminEmailsSection />
    </AdminShell>
  );
}
