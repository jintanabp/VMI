import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ค้นหาสินค้าแบบครอบคลุม: ชื่อสินค้า / รหัส / บาร์โค้ด / แบรนด์ / กลุ่ม (Section) */
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
  return [item.skuName, item.skuCode, item.barcode, item.brand, item.section].some(
    (f) => !!f && f.toLowerCase().includes(q)
  );
}
