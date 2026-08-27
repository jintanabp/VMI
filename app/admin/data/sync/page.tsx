import { AdminShell } from "@/components/admin/admin-shell";
import { FabricSyncPanel } from "@/components/admin/fabric-sync-panel";

export default function AdminDataSyncPage() {
  return (
    <AdminShell
      title="Sync & สถานะ"
      description="สถานะการดึงข้อมูลจาก Microsoft Fabric แยกรายตาราง"
    >
      <FabricSyncPanel />
    </AdminShell>
  );
}
