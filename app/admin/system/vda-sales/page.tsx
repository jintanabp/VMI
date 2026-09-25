import { AdminShell } from "@/components/admin/admin-shell";
import { SalesCodeDirectoryPanel } from "@/components/admin/sales-code-directory-panel";

export default function AdminSystemVdaSalesPage() {
  return (
    <AdminShell
      title="สิทธิ์เซลล์-VDA"
      description="รหัสเซลล์แต่ละรหัสดูแลคลังไหน และอีเมลไหนเข้าใช้งานในฐานะรหัสนั้นได้ — กำหนดอีเมลอ้างอิงได้ในตารางเลย"
    >
      <SalesCodeDirectoryPanel />
    </AdminShell>
  );
}
