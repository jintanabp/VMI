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
>(
  rows: T[]
): (T & { promoGroupStripe: PromoGroupStripe | null; promoGroupIsFirst: boolean })[] {
  let stripe: PromoGroupStripe = 0;
  let prev: string | null = null;
  let stripeIndex = -1;

  return rows.map((row) => {
    const g = row.promoGroup?.trim() || null;
    if (!isPooledPromoGroup(g, row.promoGroupMembers)) {
      return { ...row, promoGroupStripe: null, promoGroupIsFirst: false };
    }
    const isFirst = g !== prev;
    if (isFirst) {
      stripeIndex = (stripeIndex + 1) % 4;
      stripe = stripeIndex as PromoGroupStripe;
      prev = g;
    }
    return { ...row, promoGroupStripe: stripe, promoGroupIsFirst: isFirst };
  });
}

const STRIPE_ROW_CLASSES: Record<PromoGroupStripe, string> = {
  0: "border-l-[3px] border-l-violet-400 bg-violet-50/90 dark:border-l-violet-500 dark:bg-violet-950/25",
  1: "border-l-[3px] border-l-sky-400 bg-sky-50/90 dark:border-l-sky-500 dark:bg-sky-950/25",
  2: "border-l-[3px] border-l-emerald-400 bg-emerald-50/90 dark:border-l-emerald-500 dark:bg-emerald-950/25",
  3: "border-l-[3px] border-l-amber-400 bg-amber-50/90 dark:border-l-amber-500 dark:bg-amber-950/25",
};

export function promoGroupRowBgClass(
  stripe: PromoGroupStripe | null | undefined
): string {
  if (stripe == null) return "";
  return STRIPE_ROW_CLASSES[stripe];
}

export function promoGroupBadgeClass(
  stripe: PromoGroupStripe | null | undefined
): string {
  if (stripe == null) return "";
  const map: Record<PromoGroupStripe, string> = {
    0: "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-500/30",
    1: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-500/30",
    2: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/30",
    3: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/30",
  };
  return map[stripe];
}

/** นับจำนวน SKU ที่อยู่ในกลุ่มจาก master C4 */
export function countPromoGroupMembers(
  rowsForGroup: { product: string }[]
): number {
  return new Set(rowsForGroup.map((r) => r.product)).size;
}
