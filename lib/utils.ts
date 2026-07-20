import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function normalizeProductCode(code: string): string {
  return code.trim().replace(/^0+/, "") || "0";
}

/** พิมพ์เป็นตัวเลขล้วน ๆ — น่าจะหารหัสสินค้า / บาร์โค้ด */
export function looksLikeProductCodeQuery(query: string): boolean {
  return /^\d{4,}$/.test(query.trim());
}

function productCodeMatches(
  field: string | null | undefined,
  query: string
): boolean {
  if (!field) return false;
  const f = field.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!f || !q) return false;
  if (f === q || f.includes(q)) return true;
  return normalizeProductCode(f) === normalizeProductCode(q);
}

/** ค้นหาสินค้า: ชื่อ / รหัส / แบรนด์ / กลุ่ม
 *  รหัสตัวเลขล้วน → จับคู่รหัส/บาร์โค้ดแบบตรง (รองรับ leading zero) ไม่ substring บาร์โค้ด */
export function matchesProductSearch(
  query: string,
  item: {
    skuName?: string | null;
    skuCode?: string | null;
    barcode?: string | null;
    brand?: string | null;
    section?: string | null;
    promoGroup?: string | null;
  }
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (looksLikeProductCodeQuery(q)) {
    if (productCodeMatches(item.skuCode, q)) return true;
    if (productCodeMatches(item.barcode, q)) return true;
    return false;
  }

  const fields = [
    item.skuName,
    item.skuCode,
    item.brand,
    item.section,
    item.promoGroup,
  ];
  if (fields.some((f) => !!f && f.toLowerCase().includes(q))) return true;

  if (item.barcode && q.length >= 8) {
    if (item.barcode.toLowerCase().includes(q)) return true;
  }

  return false;
}
