import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ค้นหาสินค้า: ชื่อ / รหัส / แบรนด์ / กลุ่ม
 *  บาร์โค้ดใช้เฉพาะเมื่อคีย์เวิร์ดยาวพอ (≥6) กันเลขสั้น ๆ ไปเจอกลางบาร์โค้ด */
export function matchesProductSearch(
  query: string,
  item: {
    skuName?: string | null;
    skuCode?: string | null;
    barcode?: string | null;
    brand?: string | null;
    section?: string | null;
  }
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const fields = [item.skuName, item.skuCode, item.brand, item.section];
  if (fields.some((f) => !!f && f.toLowerCase().includes(q))) return true;

  // บาร์โค้ด: ใช้เมื่อพิมพ์ยาวพอ (≥6) กันเลขสั้น ๆ ไปเจอกลางบาร์โค้ด
  if (item.barcode && q.length >= 6) {
    if (item.barcode.toLowerCase().includes(q)) return true;
  }

  return false;
}
