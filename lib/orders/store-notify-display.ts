/**
 * หน้าตาของแจ้งเตือนร้านค้า — ใช้ร่วมกันระหว่างกระดิ่งบน header กับหน้าประวัติ
 *
 * แยกจาก `store-notify.ts` เพราะไฟล์นั้น import prisma (server-only) ส่วนไฟล์นี้
 * client component เรียกใช้ตรง ๆ ได้
 */

export const NOTIF_META: Record<string, { label: string; className: string }> = {
  approved: {
    label: "อนุมัติ",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  rejected: {
    label: "ปฏิเสธ",
    className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  },
  deleted: {
    label: "ลบออเดอร์",
    className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  },
  price_changed: {
    label: "แก้ราคา",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  },
  qty_changed: {
    label: "แก้จำนวน",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  },
  po_issued: {
    label: "ออก PO",
    className:
      "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
  },
};

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีก่อน`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} ชม.ก่อน`;
  const d = Math.round(h / 24);
  return d <= 30 ? `${d} วันก่อน` : fmtDateTime(iso);
}

/** โทนสีของ toast ตามชนิดแจ้งเตือน */
export function notifTone(kind: string): "success" | "warn" | "info" {
  if (kind === "rejected" || kind === "deleted") return "warn";
  if (kind === "approved" || kind === "po_issued") return "success";
  return "info";
}
