import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import { snapQtyToPromoStep } from "@/lib/promo/promo-step";
import type { StockRowComputed } from "@/lib/repositories/types";

/**
 * จำนวนแนะนำหลังหักของที่สั่งค้างอยู่แล้ว
 *
 * suggestOrder คิดจากสต็อกที่มี ณ ตอนนี้เทียบ MIN/MAX เท่านั้น — ไม่รู้จักของที่สั่งค้าง
 * ของที่สั่งวันนี้กว่าจะเข้า stock_cover_day ก็อีกหลายวัน ระหว่างนั้นมันแนะนำจำนวนเดิมซ้ำ ๆ
 * ทั้งที่ร้านสั่งไปแล้ว → สั่งเบิ้ลจนกลายเป็นของค้างสต็อก
 *
 * หักเฉพาะที่ยังไม่ถึงร้าน (pendingQty จาก /api/store/order-history) ของที่มาถึงแล้ว
 * ถูกนับใน stock อยู่แล้ว หักซ้ำจะแนะนำน้อยเกินจริง · หักแล้วมักเหลือเศษไม่ลงล็อตโปร
 * จึง snap กลับเข้าขั้นโปร (ยกเว้นโปรกลุ่มที่คุมยอดรวม ไม่ใช่รายบรรทัด)
 *
 * แยกเป็น pure function ให้ /stock กับ /order เรียกตัวเดียวกัน — เดิม /order ใช้
 * suggestOrder ดิบ ทำให้ตารางบอก "แนะนำอีก 4" แต่หน้า /order (ปุ่ม ↺, รีเซ็ต, ชิป)
 * บอก "แนะนำ 10" แล้วพาสั่งซ้ำที่ตัวหักนี้ตั้งใจกันไว้
 */
export function suggestRemainingQty(
  row: Pick<
    StockRowComputed,
    "suggestOrder" | "promoGroup" | "promoGroupMembers" | "promoTiers"
  >,
  pendingQty: number
): number {
  const base = row.suggestOrder > 0 ? row.suggestOrder : 0;
  const left = Math.max(0, base - Math.max(0, pendingQty));
  if (isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) return left;
  return snapQtyToPromoStep(row.promoTiers, left);
}
