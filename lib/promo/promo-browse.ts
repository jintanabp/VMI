import { isBenefitTier, type PromoTierInput } from "@/lib/calculations";
import {
  isPooledPromoGroup,
  promoGroupStripeFor,
  type PromoGroupStripe,
} from "./promo-group-display";

/**
 * จัดสินค้าเป็น "ถัง" ตามโปรโมชั่น สำหรับมุมมองที่เน้นโปรเป็นหลัก
 *
 * แยกจาก promo-group-display.ts เพราะไฟล์นั้นทำหน้าที่จัดลำดับ/ระบายสีลิสต์แบน
 * และอยู่บน path ของ export ฝั่ง server — โครงข้อมูลคนละแบบกัน ปนกันแล้วจะมีคนเผลอ
 * เรียก annotatePromoGroupStripes บนข้อมูลที่จัดถังแล้ว ซึ่งใช้ไม่ได้
 */

export type PromoBucketKind = "group" | "single" | "none";

export const PROMO_BUCKET_SINGLE = "__single__";
export const PROMO_BUCKET_NONE = "__none__";

export interface PromoBucket<T> {
  kind: PromoBucketKind;
  /** key สำหรับ React + sessionStorage — รหัสกลุ่ม C4 หรือค่าคงที่ของถังสังเคราะห์ */
  key: string;
  promoGroup: string | null;
  /** สีประจำกลุ่มแบบ hash — คงที่ไม่ว่าจะเรียงยังไง */
  stripe: PromoGroupStripe | null;
  title: string;
  /** ทุก skuCode ในกลุ่มที่ร้านนี้มีของ — มาจาก allRows เสมอ */
  memberSkus: string[];
  /** แถวตัวแทน — ใช้เปิด modal และอ่านโปรที่คิดจากยอดรวมกลุ่มแล้ว */
  hostRow: T | null;
  tiers: PromoTierInput[];
  /** แถวที่ผ่านตัวกรอง — ใช้เรนเดอร์จริง */
  rows: T[];
  /** จำนวนสมาชิกทั้งหมดก่อนกรอง */
  totalRows: number;
}

interface BucketableRow {
  skuCode: string;
  promoGroup?: string | null;
  promoGroupMembers?: number;
  promoTiers?: PromoTierInput[];
  needsOrder?: boolean;
}

function hasBenefit(row: BucketableRow): boolean {
  return (row.promoTiers ?? []).some(isBenefitTier);
}

/**
 * สร้างถังโปรจากแถวทั้งหมด + แถวที่มองเห็น
 *
 * **สองลิสต์คือหัวใจ** — สมาชิกกลุ่ม ยอดรวม และรายการใน modal ต้องมาจาก allRows
 * ส่วน rows ที่เรนเดอร์มาจาก visibleRows เท่านั้น สลับกันเมื่อไหร่จะได้บั๊กเดียวกับที่
 * คอมเมนต์ใน stock-page-client อธิบายไว้: ค้นหาสมาชิกตัวเดียวแล้วยอดรวมกลุ่มเพี้ยน
 */
export function buildPromoBuckets<T extends BucketableRow>(
  allRows: T[],
  visibleRows: T[]
): PromoBucket<T>[] {
  const visibleCodes = new Set(visibleRows.map((r) => r.skuCode));
  // เรียงตาม visibleRows เพื่อให้ลำดับแถวในการ์ดตรงกับที่ผู้ใช้เลือกเรียงไว้
  const visibleOrder = new Map(visibleRows.map((r, i) => [r.skuCode, i]));

  // กลุ่มไหนมีสิทธิประโยชน์จริง — ต้องดูทั้งกลุ่ม ไม่ใช่แค่แถวเดียว
  const groupHasBenefit = new Map<string, boolean>();
  for (const row of allRows) {
    if (!isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) continue;
    const g = row.promoGroup!.trim();
    if (hasBenefit(row)) groupHasBenefit.set(g, true);
    else if (!groupHasBenefit.has(g)) groupHasBenefit.set(g, false);
  }

  const groups = new Map<string, T[]>();
  const singles: T[] = [];
  const none: T[] = [];

  for (const row of allRows) {
    const g = row.promoGroup?.trim() ?? "";
    const pooled =
      isPooledPromoGroup(row.promoGroup, row.promoGroupMembers) &&
      groupHasBenefit.get(g) === true;

    if (pooled) {
      const list = groups.get(g) ?? [];
      list.push(row);
      groups.set(g, list);
      continue;
    }
    // โปร SKU เดี่ยว — promoGroup เป็น null เสมอเมื่อ C4 มีสมาชิกกลุ่มเดียว
    // จึงห้ามถือว่า "มี tiers = มีกลุ่ม"
    if (hasBenefit(row)) {
      singles.push(row);
      continue;
    }
    none.push(row);
  }

  const sortRows = (rows: T[]) =>
    [...rows].sort(
      (a, b) =>
        (visibleOrder.get(a.skuCode) ?? Number.MAX_SAFE_INTEGER) -
        (visibleOrder.get(b.skuCode) ?? Number.MAX_SAFE_INTEGER)
    );

  const buckets: PromoBucket<T>[] = [];

  for (const [group, members] of groups) {
    const ordered = sortRows(members);
    const shown = ordered.filter((r) => visibleCodes.has(r.skuCode));
    const host = members.find(hasBenefit) ?? members[0] ?? null;
    buckets.push({
      kind: "group",
      key: group,
      promoGroup: group,
      stripe: promoGroupStripeFor(group),
      title: group,
      memberSkus: members.map((r) => r.skuCode),
      hostRow: host,
      tiers: host?.promoTiers ?? [],
      rows: shown,
      totalRows: members.length,
    });
  }

  // ลำดับต้องไม่ขึ้นกับจำนวนที่ผู้ใช้กำลังพิมพ์ ไม่งั้นการ์ดกระโดดตอนกด +
  buckets.sort((a, b) => {
    const aNeeds = a.rows.some((r) => r.needsOrder) ? 0 : 1;
    const bNeeds = b.rows.some((r) => r.needsOrder) ? 0 : 1;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    if (a.totalRows !== b.totalRows) return b.totalRows - a.totalRows;
    return a.key.localeCompare(b.key, "en", { numeric: true });
  });

  if (singles.length > 0) {
    const ordered = sortRows(singles);
    buckets.push({
      kind: "single",
      key: PROMO_BUCKET_SINGLE,
      promoGroup: null,
      stripe: null,
      title: "โปรเฉพาะรายสินค้า",
      memberSkus: singles.map((r) => r.skuCode),
      hostRow: null,
      tiers: [],
      rows: ordered.filter((r) => visibleCodes.has(r.skuCode)),
      totalRows: singles.length,
    });
  }

  if (none.length > 0) {
    const ordered = sortRows(none);
    buckets.push({
      kind: "none",
      key: PROMO_BUCKET_NONE,
      promoGroup: null,
      stripe: null,
      title: "ไม่มีโปรโมชั่น",
      memberSkus: none.map((r) => r.skuCode),
      hostRow: null,
      tiers: [],
      rows: ordered.filter((r) => visibleCodes.has(r.skuCode)),
      totalRows: none.length,
    });
  }

  return buckets.filter((b) => b.rows.length > 0);
}

/** ยอดรวมของ SKU ชุดหนึ่ง — ใช้ทั้งยอดกลุ่ม (ทุกสมาชิก) และยอดที่ติ๊กเลือกจริง */
export function sumStagedFor(
  skuCodes: readonly string[],
  stagedQty: Record<string, number>
): number {
  let total = 0;
  for (const code of skuCodes) total += stagedQty[code] ?? 0;
  return total;
}

/** ขั้นโปรที่ได้ ณ จำนวนหนึ่ง — null เมื่อยังไม่ถึงขั้นแรก */
export function activeTierAt(
  tiers: PromoTierInput[],
  qty: number
): PromoTierInput | null {
  let active: PromoTierInput | null = null;
  for (const t of [...tiers].sort((a, b) => a.minQty - b.minQty)) {
    if (qty >= t.minQty && isBenefitTier(t)) active = t;
  }
  return active;
}
