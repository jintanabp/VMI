"use client";

import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { AdminPromoPanel } from "@/components/admin/admin-promo-panel";
import { useSalesSession } from "@/hooks/use-sales-session";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { SalesNav } from "./sales-nav";

/**
 * โปร C4 รายคลังสำหรับฝั่งเซลล์
 *
 * ใช้ panel ตัวเดียวกับหน้าแอดมิน — ตัว panel ถามข้อมูลจาก `/api/promo/month`
 * ซึ่งตัดสินสิทธิ์ฝั่งเซิร์ฟเวอร์อยู่แล้ว (แอดมินเลือกได้ทุกคลัง เซลล์ได้เฉพาะคลัง
 * ที่ดูแล) จึงไม่ต้องมีสองหน้าที่ต้องคอยแก้ให้ตรงกัน
 */
export function SalesPromoClient() {
  const { session } = useSalesSession();
  const salesPreview = useSalesPreview();

  return (
    <PageShell>
      <AppHeader
        compact
        wide
        title="โปรโมชั่น C4"
        subtitle={
          salesPreview
            ? `${salesPreview.asCode} · ${salesPreview.asName}`
            : (session?.salesmanName ?? session?.email ?? "")
        }
        role={session?.role ?? "sales"}
      />

      <main className="mx-auto w-full max-w-[min(100%,96rem)] space-y-3 px-3 py-3 sm:px-4">
        <SalesNav />
        <AdminPromoPanel />
      </main>
    </PageShell>
  );
}
