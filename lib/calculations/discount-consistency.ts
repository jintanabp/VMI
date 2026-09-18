export type DiscountFlagReason = "group_mismatch" | "pooled_qty_mismatch" | null;

export interface PooledDiscountCheckItem {
  skuCode: string;
  finalQty: number;
  c4PromoGroup: string | null;
  c4PooledQty: number | null;
  c4DiscountBaht: number | null;
  c4DiscountPct: number | null;
  c4PromoLabel: string | null;
}

export interface PooledDiscountFlag {
  flagged: boolean;
  reason: DiscountFlagReason;
}

/**
 * ตรวจความสอดคล้องของโปรกลุ่มภายในออเดอร์เดียวกัน — ไม่คำนวณใหม่เทียบกับค่าที่
 * กำลังจะบันทึก (เทียบค่ากับตัวเองในจังหวะเดียวกัน ไม่มีประโยชน์ เหตุผลเดียวกับที่
 * priceFlagged ไม่คำนวณราคาซ้ำตอนอ่านเพื่อเทียบ — ดู app/api/orders/route.ts)
 *
 * แต่เช็คว่าสมาชิกกลุ่มโปรเดียวกันในออเดอร์นี้ ได้ discountBaht/discountPct/
 * currentPromo ตรงกันทุกตัวหรือไม่ และ pooledQty ตรงกับผลรวมจำนวนที่สั่งจริง
 * ของสมาชิกกลุ่มหรือไม่ — ถ้าไม่ตรงคือสัญญาณว่าตัวเลขกับข้อความ (หรือสมาชิกแต่ละ
 * ตัว) ถูกคิดมาจากคนละแหล่งกัน ซึ่งเป็นรูปแบบเดียวกับบั๊กที่เจอจริง
 * (ตัวเลขส่วนลดถูก 140 แต่ข้อความโปรผิดเป็น 63 ทั้งสองแถวในกลุ่มเดียวกัน)
 *
 * เตือนเฉย ๆ ไม่บล็อกการส่ง — คำแนะนำต้องไม่กลายเป็นข้อห้าม เหมือน priceFlagged
 */
export function evaluatePooledDiscountConsistency(
  items: PooledDiscountCheckItem[]
): Map<string, PooledDiscountFlag> {
  const result = new Map<string, PooledDiscountFlag>();
  for (const item of items) {
    result.set(item.skuCode, { flagged: false, reason: null });
  }

  const groups = new Map<string, PooledDiscountCheckItem[]>();
  for (const item of items) {
    const group = item.c4PromoGroup?.trim();
    if (!group) continue;
    const list = groups.get(group) ?? [];
    list.push(item);
    groups.set(group, list);
  }

  for (const members of groups.values()) {
    // กลุ่มที่มีสมาชิกแค่ตัวเดียวในออเดอร์นี้ไม่มีอะไรให้เทียบ
    if (members.length <= 1) continue;

    const sumQty = members.reduce((s, m) => s + (m.finalQty || 0), 0);
    const pooledQtyMismatch = members.some(
      (m) => m.c4PooledQty == null || m.c4PooledQty !== sumQty
    );

    const first = members[0]!;
    const groupMismatch = members.some(
      (m) =>
        m.c4DiscountBaht !== first.c4DiscountBaht ||
        m.c4DiscountPct !== first.c4DiscountPct ||
        m.c4PromoLabel !== first.c4PromoLabel
    );

    if (pooledQtyMismatch || groupMismatch) {
      const reason: DiscountFlagReason = pooledQtyMismatch
        ? "pooled_qty_mismatch"
        : "group_mismatch";
      for (const m of members) {
        result.set(m.skuCode, { flagged: true, reason });
      }
    }
  }

  return result;
}
