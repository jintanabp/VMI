import { AdminShell } from "@/components/admin/admin-shell";
import { FabricSyncPanel } from "@/components/admin/fabric-sync-panel";

export default function AdminSyncPage() {
  return (
    <AdminShell
      title="ข้อมูล & Sync"
      description="สถานะการดึงข้อมูลจาก Microsoft Fabric แยกรายตาราง"
    >
      <FabricSyncPanel />
    </AdminShell>
  );
}
