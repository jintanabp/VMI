import {
  fabricSkuMasterReady,
  getSkuMasterDirectory,
} from "@/lib/fabric";

/**
 * VatStatus ต่อรหัสสินค้า — ใช้ตอนออก PO และตอนประกอบ payload ERP
 *
 * แยกออกมาเป็นไฟล์เดียวเพราะมีผู้เรียก 3 ทาง (อนุมัติ, ประกอบเอกสารใหม่จาก DB,
 * พรีวิว payload) และทั้งสามต้องได้คำตอบเดียวกัน
 *
 * **คืน `null` เมื่อ master ยังไม่โหลดด้วย** — ไม่ใช่เดาว่า "Y"
 * ผลคือใบที่ออกตอน master ยังไม่พร้อมจะถูกกันไม่ให้ส่ง ERP แทนที่จะส่งตัวเลขที่เดาเอา
 */
export function skuVatStatus(skuCode: string): "Y" | "N" | null {
  if (!fabricSkuMasterReady()) return null;
  return getSkuMasterDirectory().vatStatusForSku(skuCode);
}
