import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEmailsSection } from "@/components/admin/admin-emails-section";
import { VdaSalesAccessPanel } from "@/components/admin/vda-sales-access-panel";

export default function AdminSettingsPage() {
  return (
    <AdminShell
      title="ตั้งค่าระบบ"
      description="ผู้ดูแลระบบ และการแมป VDA ↔ เซลล์"
    >
      <div className="space-y-4">
        <AdminEmailsSection />
        <VdaSalesAccessPanel />
      </div>
    </AdminShell>
  );
}
