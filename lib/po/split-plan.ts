import { groupKeyAt } from "./po-number";

/**
 * การแบ่งออเดอร์เดียวออกเป็นหลาย PO
 *
 * `ocr-po-matching` **ไม่มีกฎแบ่งอัตโนมัติเลย** — คนเลือกกลุ่มเองทั้งหมด
 * (endpoint `split_by="brand"` มีอยู่แต่ frontend ไม่เคยเรียก) เราจึงกำหนดกฎเอง:
 * แยกตาม "ราคาตรง C4 / ไม่ตรง C4" แล้วให้พนักงานย้ายรายการได้เอง
 *
 * ฟังก์ชันในไฟล์นี้เป็น pure ทั้งหมด ไม่แตะ DB — client กับ server ใช้ร่วมกันได้
 * และเทสได้โดยไม่ต้องมีฐานข้อมูล
 */

export type PoPriceKind = "c4" | "override" | "mixed";

/** ข้อมูลเท่าที่การแบ่ง PO ต้องใช้ — รับได้ทั้งจาก DB row และ payload ฝั่ง client */
export interface SplittableItem {
  id: string;
  skuCode: string;
  skuName: string;
  finalQty: number;
  /** ราคาที่ร้าน/พนักงานแก้แล้วไม่ตรง C4 */
  priceFlagged?: boolean;
  /** ราคาที่มีผลต่อหีบ — ใช้คิดมูลค่ารวมของ PO */
  effectiveUnitPrice?: number | null;
  /** รหัสกลุ่มโปร C4 ที่รวมยอดกันได้ (null = โปรราย SKU) */
  promoGroup?: string | null;
  promoGroupMembers?: number | null;
  /** true = บรรทัดนี้เป็นของแถมที่ผูกกับสินค้าอื่น */
  isFreeGood?: boolean;
  /** SKU ที่ทำให้ได้ของแถมนี้ */
  freeGoodPairSku?: string | null;
  /** กลุ่มที่ถูกจัดไว้แล้ว (จาก DB) */
  poGroup?: string | null;
}

export interface PoSplitGroup {
  groupKey: string;
  label: string;
  priceKind: PoPriceKind;
  itemIds: string[];
  itemCount: number;
  totalQty: number;
  totalAmount: number;
}

const LABEL_C4 = "ราคาตรง C4";
const LABEL_OVERRIDE = "ราคาไม่ตรง C4";

function amountOf(item: SplittableItem): number {
  const price = item.effectiveUnitPrice;
  if (price == null || !Number.isFinite(price)) return 0;
  return price * item.finalQty;
}

function priceKindOf(items: SplittableItem[]): PoPriceKind {
  const flagged = items.filter((i) => i.priceFlagged).length;
  if (flagged === 0) return "c4";
  if (flagged === items.length) return "override";
  return "mixed";
}

function labelFor(kind: PoPriceKind, groupKey: string): string {
  if (kind === "c4") return LABEL_C4;
  if (kind === "override") return LABEL_OVERRIDE;
  return `กลุ่ม ${groupKey} (ราคาผสม)`;
}

/** สรุปกลุ่มจากรายการที่ถูกจัดไว้แล้ว (map groupKey → items) */
export function summarizeGroups(
  assignment: Map<string, SplittableItem[]>
): PoSplitGroup[] {
  const out: PoSplitGroup[] = [];
  for (const groupKey of [...assignment.keys()].sort()) {
    const items = assignment.get(groupKey) ?? [];
    if (items.length === 0) continue;
    const kind = priceKindOf(items);
    out.push({
      groupKey,
      label: labelFor(kind, groupKey),
      priceKind: kind,
      itemIds: items.map((i) => i.id),
      itemCount: items.length,
      totalQty: items.reduce((s, i) => s + i.finalQty, 0),
      totalAmount:
        Math.round(items.reduce((s, i) => s + amountOf(i), 0) * 100) / 100,
    });
  }
  return out;
}

/**
 * เสนอการแบ่ง: A = ราคาตรง C4, B = ราคาไม่ตรง C4 — ข้ามกลุ่มที่ว่าง
 *
 * ทุกบรรทัดตรง C4 หมด ⇒ เหลือกลุ่มเดียว = ไม่มีการแบ่ง (เลข PO ไม่ต่อ suffix)
 * ถ้ามีการจัดกลุ่มไว้แล้วใน DB จะยึดค่านั้น ไม่เสนอใหม่ทับของที่พนักงานตั้งใจ
 */
export function proposePoSplit(items: SplittableItem[]): PoSplitGroup[] {
  if (items.length === 0) return [];

  const alreadyAssigned = items.some((i) => i.poGroup);
  const assignment = new Map<string, SplittableItem[]>();

  if (alreadyAssigned) {
    for (const item of items) {
      // บรรทัดที่ยังไม่ถูกจัด ให้ไปกองที่กลุ่มตามเกณฑ์ราคา เพื่อไม่ให้หลุดหาย
      const key = item.poGroup ?? (item.priceFlagged ? "B" : "A");
      const list = assignment.get(key) ?? [];
      list.push(item);
      assignment.set(key, list);
    }
    return summarizeGroups(assignment);
  }

  for (const item of items) {
    const key = item.priceFlagged ? "B" : "A";
    const list = assignment.get(key) ?? [];
    list.push(item);
    assignment.set(key, list);
  }

  // เหลือกลุ่มเดียว → ใช้ A เสมอ เพื่อให้ "ไม่แบ่ง" อ่านง่าย
  if (assignment.size === 1) {
    const only = [...assignment.values()][0]!;
    return summarizeGroups(new Map([["A", only]]));
  }
  return summarizeGroups(assignment);
}

/** กลุ่มถัดไปที่ยังไม่ถูกใช้ (A, B, C, …) */
export function nextFreeGroupKey(used: Iterable<string>): string {
  const set = new Set([...used]);
  for (let i = 0; i < 26; i++) {
    const key = groupKeyAt(i);
    if (!set.has(key)) return key;
  }
  return groupKeyAt(25);
}

/**
 * ตรวจก่อนอนุมัติ — คืนรายการปัญหาเป็นข้อความไทย (ว่าง = ผ่าน)
 *
 * ข้อจำกัดสำคัญที่สุดคือ **สินค้าในกลุ่มโปร C4 เดียวกันต้องอยู่ PO เดียวกัน**
 * เพราะส่วนลดคิดจากยอดรวมของกลุ่ม ถ้าหักออกจากกันยอดจะไม่ถึงขั้นบันได
 * แล้วส่วนลดที่คำนวณไว้จะใช้ไม่ได้จริง
 * (กฎของแถมยืมจาก ocr-po-matching/frontend/src/lineItemReview.js:splitPairMissing)
 */
export function validatePoSplit(items: SplittableItem[]): string[] {
  const errors: string[] = [];
  if (items.length === 0) return ["ออเดอร์นี้ไม่มีรายการสินค้า"];

  const unassigned = items.filter((i) => !i.poGroup);
  if (unassigned.length > 0 && unassigned.length < items.length) {
    errors.push(
      `ยังไม่ได้จัดกลุ่ม PO ให้ ${unassigned.length} รายการ (${unassigned
        .slice(0, 3)
        .map((i) => i.skuCode)
        .join(", ")}${unassigned.length > 3 ? " …" : ""})`
    );
  }

  const groupOf = (i: SplittableItem) => i.poGroup ?? "A";

  // 1) กลุ่มโปร C4 ที่รวมยอดกันได้ ต้องไม่ถูกหักออกจากกัน
  const byPromoGroup = new Map<string, Set<string>>();
  for (const item of items) {
    const g = item.promoGroup?.trim();
    if (!g) continue;
    if ((item.promoGroupMembers ?? 0) <= 1) continue;
    const set = byPromoGroup.get(g) ?? new Set<string>();
    set.add(groupOf(item));
    byPromoGroup.set(g, set);
  }
  for (const [promoGroup, poGroups] of byPromoGroup) {
    if (poGroups.size > 1) {
      errors.push(
        `สินค้าในกลุ่มโปร ${promoGroup} ถูกแยกไปหลาย PO (${[...poGroups]
          .sort()
          .join(", ")}) — ส่วนลดขั้นบันไดจะคิดไม่ได้ ต้องอยู่ PO เดียวกัน`
      );
    }
  }

  // 2) ของแถมต้องอยู่กลุ่มเดียวกับสินค้าที่ทำให้ได้แถม
  const groupBySku = new Map<string, string>();
  for (const item of items) groupBySku.set(item.skuCode, groupOf(item));
  for (const item of items) {
    if (!item.isFreeGood || !item.freeGoodPairSku) continue;
    const pairGroup = groupBySku.get(item.freeGoodPairSku);
    if (pairGroup && pairGroup !== groupOf(item)) {
      errors.push(
        `ของแถม ${item.skuCode} อยู่ PO ${groupOf(item)} แต่สินค้าที่ทำให้ได้แถม (${item.freeGoodPairSku}) อยู่ PO ${pairGroup}`
      );
    }
  }

  return errors;
}
