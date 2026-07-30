import {
  formatPromoTierLabelVerbose,
  isBenefitTier,
  type PromoTierInput,
} from "@/lib/calculations";

/**
 * ชื่อโปรโมชั่นที่อ่านรู้เรื่อง
 *
 * ตาราง C4 (`cft_promotion_*.csv`) **ไม่มีคอลัมน์ชื่อโปรเลย** — มีแค่
 * `ASSORTEDPRODUCTGROUP` (รหัสกลุ่ม เช่น AP50K), `MARKETINGUSER`, `USERCODE`
 * ที่ผ่านมา UI จึงโชว์รหัสกลุ่มดิบ ๆ ซึ่งร้านค้าอ่านไม่ออก
 * ที่นี่จึงสังเคราะห์ชื่อจาก "เงื่อนไขที่ได้จริง" ของขั้นบันไดแทน
 */
export interface PromoTitle {
  /** บรรทัดหลัก — "ซื้อ 10+ หีบ ลด 600" */
  headline: string;
  /** บรรทัดรอง — "กลุ่ม AP50K · 5 สินค้า · หมดใน 5 วัน" */
  meta: string;
}

export function buildPromoTitle(args: {
  group?: string | null;
  tiers?: PromoTierInput[] | null;
  memberCount?: number;
  endsInDays?: number | null;
}): PromoTitle {
  const benefit = (args.tiers ?? [])
    .filter(isBenefitTier)
    .slice()
    .sort((a, b) => a.minQty - b.minQty);

  let headline: string;
  if (benefit.length === 0) {
    headline = "ไม่มีส่วนลดขั้นบันได";
  } else {
    // ใช้ขั้นต่ำสุดที่ให้ประโยชน์ — เป็นขั้นที่ร้านเอื้อมถึงก่อน
    // (ขั้นสูงกว่าแสดงครบใน PromoLadderStrip อยู่แล้ว)
    const first = benefit[0]!;
    headline =
      formatPromoTierLabelVerbose(first) || `ซื้อ ${first.minQty}+ หีบ`;
    if (benefit.length > 1) headline += ` (+${benefit.length - 1} ขั้น)`;
  }

  const metaParts: string[] = [];
  const group = args.group?.trim();
  if (group) metaParts.push(`กลุ่ม ${group}`);
  if (args.memberCount != null && args.memberCount > 1) {
    metaParts.push(`${args.memberCount} สินค้า`);
  }
  if (args.endsInDays != null && args.endsInDays >= 0) {
    metaParts.push(
      args.endsInDays === 0 ? "หมดวันนี้" : `หมดใน ${args.endsInDays} วัน`
    );
  }

  return { headline, meta: metaParts.join(" · ") };
}
