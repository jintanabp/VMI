/** โปรกลุ่ม ASSORTEDPRODUCTGROUP ที่รวม qty ข้ามหลาย SKU ได้ */
export function isPooledPromoGroup(
  promoGroup?: string | null,
  promoGroupMembers?: number | null
): boolean {
  return Boolean(promoGroup?.trim() && (promoGroupMembers ?? 0) > 1);
}

export function sortRowsByPromoGroup<
  T extends { promoGroup?: string | null; skuCode: string; needsOrder?: boolean },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ga = a.promoGroup?.trim() || "\uffff";
    const gb = b.promoGroup?.trim() || "\uffff";
    if (ga !== gb) {
      return ga.localeCompare(gb, undefined, { numeric: true });
    }
    // \u0e20\u0e32\u0e22\u0e43\u0e19\u0e01\u0e25\u0e38\u0e48\u0e21\u0e42\u0e1b\u0e23\u0e2f \u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e19: \u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e17\u0e35\u0e48\u0e41\u0e19\u0e30\u0e19\u0e33\u0e2a\u0e31\u0e48\u0e07\u0e02\u0e36\u0e49\u0e19\u0e01\u0e48\u0e2d\u0e19 \u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e41\u0e19\u0e30\u0e19\u0e33\u0e44\u0e1b\u0e2d\u0e22\u0e39\u0e48\u0e25\u0e48\u0e32\u0e07 (\u0e40\u0e1c\u0e37\u0e48\u0e2d\u0e0b\u0e37\u0e49\u0e2d\u0e23\u0e48\u0e27\u0e21)
    // \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e49\u0e01\u0e31\u0e1a\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e19\u0e2d\u0e01\u0e01\u0e25\u0e38\u0e48\u0e21 ("\uffff") \u2014 \u0e04\u0e07\u0e40\u0e23\u0e35\u0e22\u0e07\u0e15\u0e32\u0e21\u0e23\u0e2b\u0e31\u0e2a\u0e40\u0e14\u0e34\u0e21
    if (ga !== "\uffff") {
      const sa = a.needsOrder ? 0 : 1;
      const sb = b.needsOrder ? 0 : 1;
      if (sa !== sb) return sa - sb;
    }
    return a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true });
  });
}

/** เรียงหน้าสต็อก: โปรกลุ่มรวมกันก่อน สินค้าไม่มีกลุ่มอยู่ท้าย (กันมาม่าใหม่ไปต่อท้าย PJ2.5G) */
export function sortStockDisplayRows<
  T extends {
    promoGroup?: string | null;
    promoGroupMembers?: number | null;
    skuCode: string;
    needsOrder?: boolean;
    isNew?: boolean;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aGrouped = isPooledPromoGroup(a.promoGroup, a.promoGroupMembers)
      ? 0
      : 1;
    const bGrouped = isPooledPromoGroup(b.promoGroup, b.promoGroupMembers)
      ? 0
      : 1;
    if (aGrouped !== bGrouped) return aGrouped - bGrouped;

    if (aGrouped === 0) {
      const ga = a.promoGroup!.trim();
      const gb = b.promoGroup!.trim();
      if (ga !== gb) {
        return ga.localeCompare(gb, undefined, { numeric: true });
      }
      const aNew = a.isNew ? 0 : 1;
      const bNew = b.isNew ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      const sa = a.needsOrder ? 0 : 1;
      const sb = b.needsOrder ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true });
    }

    const aNew = a.isNew ? 0 : 1;
    const bNew = b.isNew ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    return a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true });
  });
}

/** แถวนี้อยู่ถัดจากบล็อกโปรกลุ่มที่จบแล้ว (เช่น สินค้าใหม่ที่ไม่มีกลุ่ม) */
export function followsPooledPromoGroup<
  T extends { promoGroup?: string | null; promoGroupMembers?: number | null },
>(rows: T[], index: number): boolean {
  if (index <= 0) return false;
  const prev = rows[index - 1];
  const row = rows[index];
  if (!prev || !row) return false;
  return (
    isPooledPromoGroup(prev.promoGroup, prev.promoGroupMembers) &&
    !isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)
  );
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
