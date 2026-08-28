import { SalesDashboardClient } from "@/components/sales/sales-dashboard-client";

/**
 * `/sales` = หน้าภาพรวม (เดิมส่งต่อไป `/sales/orders`)
 * guard อยู่ที่ app/sales/layout.tsx ผู้ที่ยังไม่ล็อกอินถูกส่งไป /login ก่อนถึงตรงนี้
 */
export default function SalesDashboardPage() {
  return <SalesDashboardClient />;
}
