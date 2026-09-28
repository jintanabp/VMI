import { AlertTriangle, Bell, PackageCheck, PackagePlus, Trash2 } from "lucide-react";

/**
 * หน้าตาของแจ้งเตือนฝั่งเซลล์ — ใช้ร่วมกันระหว่างกระดิ่งบน header กับหน้า /sales/notifications
 * (ไฟล์นี้ไม่ import prisma จึงใช้ใน client component ได้ · ฝั่งเขียนอยู่ที่ sales-notify.ts)
 */
export const ORDER_KIND_META: Record<
  string,
  { label: string; icon: typeof PackagePlus; className: string }
> = {
  order_created: {
    label: "ออเดอร์ใหม่",
    icon: PackagePlus,
    className: "text-teal-600 dark:text-teal-400",
  },
  order_cancelled: {
    label: "ร้านยกเลิก",
    icon: Trash2,
    className: "text-red-600 dark:text-red-400",
  },
  qty_increase_confirmed: {
    label: "ร้านยืนยันเพิ่มจำนวน",
    icon: PackagePlus,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  qty_increase_rejected: {
    label: "ร้านปฏิเสธเพิ่มจำนวน",
    icon: Trash2,
    className: "text-red-600 dark:text-red-400",
  },
  item_added_confirmed: {
    label: "ร้านรับสินค้าที่เพิ่ม",
    icon: PackagePlus,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  item_added_rejected: {
    label: "ร้านไม่รับสินค้าที่เพิ่ม",
    icon: Trash2,
    className: "text-red-600 dark:text-red-400",
  },
  // ส่ง PO เข้า ERP ไม่สำเร็จ — เซลล์ทุกคนของคลังนั้นต้องเห็น ไม่ใช่แค่คนที่กดส่ง
  erp_failed: {
    label: "ส่ง ERP ไม่สำเร็จ",
    icon: AlertTriangle,
    className: "text-red-600 dark:text-red-400",
  },
  // ร้านยกเลิกหยุดสั่ง — ไม่ผูกออเดอร์ (orderId = null) จอจึงไม่มีทางลัดเปิดออเดอร์
  sku_unblocked: {
    label: "ยกเลิกหยุดสั่ง",
    icon: PackageCheck,
    className: "text-sky-600 dark:text-sky-400",
  },
};

/**
 * ชนิดที่จอไม่รู้จัก (เพิ่มฝั่งเขียนแล้วแต่ลืมเพิ่มตรงนี้) — ป้ายกลาง ๆ
 * เดิม fallback เป็น "ออเดอร์ใหม่" ทำให้แจ้งเตือนเรื่องอื่นดูเหมือนมีออเดอร์เข้ามา
 */
export const ORDER_KIND_FALLBACK = {
  label: "แจ้งเตือน",
  icon: Bell,
  className: "text-slate-600 dark:text-slate-400",
};
