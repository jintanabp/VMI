/** โปรกลุ่ม ASSORTEDPRODUCTGROUP ที่รวม qty ข้ามหลาย SKU ได้ */
export function isPooledPromoGroup(
  promoGroup?: string | null,
  promoGroupMembers?: number | null
): boolean {
  return Boolean(promoGroup?.trim() && (promoGroupMembers ?? 0) > 1);
}

export function sortRowsByPromoGroup<
  T extends { promoGroup?: string | null; skuCode: string },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ga = a.promoGroup?.trim() || "\uffff";
    const gb = b.promoGroup?.trim() || "\uffff";
    if (ga !== gb) {
      return ga.localeCompare(gb, undefined, { numeric: true });
    }
    return a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true });
  });
}

export type PromoGroupStripe = 0 | 1 | 2 | 3;

export function annotatePromoGroupStripes<
  T extends { promoGroup?: string | null; promoGroupMembers?: number },
>(rows: T[]): (T & { promoGroupStripe: PromoGroupStripe | null })[] {
  let stripe: PromoGroupStripe = 0;
  let prev: string | null = null;
  let stripeIndex = -1;

  return rows.map((row) => {
    const g = row.promoGroup?.trim() || null;
    if (!isPooledPromoGroup(g, row.promoGroupMembers)) {
      return { ...row, promoGroupStripe: null };
    }
    if (g !== prev) {
      stripeIndex = (stripeIndex + 1) % 4;
      stripe = stripeIndex as PromoGroupStripe;
      prev = g;
    }
    return { ...row, promoGroupStripe: stripe };
  });
}

/** เน้นกลุ่มโปร — โหมดสว่างใช้เส้นและพื้นชัดขึ้น */
const GROUP_ROW_CLASS =
  "border-l-[3px] border-l-slate-400 bg-slate-100/95 dark:border-l-slate-600 dark:bg-slate-800/25";

export function promoGroupRowBgClass(
  stripe: PromoGroupStripe | null | undefined
): string {
  if (stripe == null) return "";
  return GROUP_ROW_CLASS;
}

/** นับจำนวน SKU ที่อยู่ในกลุ่มจาก master C4 */
export function countPromoGroupMembers(
  rowsForGroup: { product: string }[]
): number {
  return new Set(rowsForGroup.map((r) => r.product)).size;
}
