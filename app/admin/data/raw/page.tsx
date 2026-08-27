import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { DataExplorerPanel } from "@/components/admin/data-explorer/data-explorer-panel";

export default function AdminDataRawPage() {
  return (
    <AdminShell
      title="ดูข้อมูลดิบ"
      description="เปิดตารางเต็มของไฟล์ที่ sync มาและตารางในระบบ — ชื่อไฟล์กับสถานะ sync พิสูจน์เนื้อในไม่ได้"
    >
      {/* ต้องมี Suspense: panel ใช้ useSearchParams() ทำ deep link (?src=...)
          ถ้าไม่ครอบ Next 15 จะ build ไม่ผ่านทั้งหน้า */}
      <Suspense fallback={null}>
        <DataExplorerPanel />
      </Suspense>
    </AdminShell>
  );
}
