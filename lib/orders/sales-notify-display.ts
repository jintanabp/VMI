import { PackagePlus, Trash2 } from "lucide-react";

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
};
