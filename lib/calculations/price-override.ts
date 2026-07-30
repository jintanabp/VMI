import { calcNetUnitPrice } from "./promo";

/**
 * ราคา/หีบ ที่ร้านแก้เอง เทียบกับราคาที่ระบบ (C4 + CreditPrice) คำนวณได้
 *
 * ร้านแก้ "ราคาปกติ/หีบ" เท่านั้น ส่วนลด C4 ยังคิดทับบนราคาที่ร้านใส่
 * — ร้านโต้แย้งราคาแคตตาล็อกได้ แต่ปั้นขั้นโปรเองไม่ได้
 */

/** ครึ่งสตางค์ — ต่ำกว่านี้ถือเป็น float noise ไม่ใช่ราคาที่ต่างกันจริง */
export const PRICE_MATCH_EPSILON = 0.005;

export type PriceFlagReason = "mismatch" | "no_baseline" | "unverified" | null;

/** ปัดเงินเป็น 2 ตำแหน่ง — กัน 1234.5600000000001 ลงฐานข้อมูล */
export function roundBaht(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isPriceMismatch(
  override: number | null | undefined,
  baseline: number | null | undefined
): boolean {
  if (override == null || baseline == null) return false;
  return Math.abs(override - baseline) > PRICE_MATCH_EPSILON;
}

export interface PriceOverrideVerdict {
  /** ราคาที่ร้านใส่ ปัดแล้ว (null = ไม่ได้แก้) */
  override: number | null;
  flagged: boolean;
  reason: PriceFlagReason;
  /** override − baseline (บาท/หีบ) — null เมื่อเทียบไม่ได้ */
  diff: number | null;
}

export function evaluatePriceOverride(args: {
  override: number | null | undefined;
  c4UnitPrice: number | null | undefined;
  /** false = โหลดตาราง C4 ไม่ได้ → ยืนยันราคาไม่ได้ ต้องให้เซลล์ดูเอง */
  promoLoaded?: boolean;
}): PriceOverrideVerdict {
  const raw = args.override;
  if (raw == null || !Number.isFinite(raw)) {
    return { override: null, flagged: false, reason: null, diff: null };
  }

  const override = roundBaht(raw);

  if (args.promoLoaded === false) {
    return { override, flagged: true, reason: "unverified", diff: null };
  }
  if (args.c4UnitPrice == null) {
    // ร้านพิมพ์ราคาลงช่องที่ระบบไม่มีค่าอ้างอิง — เซลล์ต้องเห็น
    return { override, flagged: true, reason: "no_baseline", diff: null };
  }

  const mismatch = isPriceMismatch(override, args.c4UnitPrice);
  return {
    override,
    flagged: mismatch,
    reason: mismatch ? "mismatch" : null,
    diff: roundBaht(override - args.c4UnitPrice),
  };
}

/** ราคาที่ใช้จริงของบรรทัดนี้ — override ถ้ามี ไม่งั้นราคาระบบ */
export function resolveEffectivePrice(args: {
  override: number | null | undefined;
  unitPrice: number | null | undefined;
  discountBaht: number | null | undefined;
  discountPct: number | null | undefined;
}): { unitPrice: number | null; netUnitPrice: number | null } {
  const unit = args.override ?? args.unitPrice ?? null;
  if (unit == null) return { unitPrice: null, netUnitPrice: null };
  return {
    unitPrice: unit,
    netUnitPrice:
      calcNetUnitPrice(unit, args.discountBaht, args.discountPct) ?? unit,
  };
}

export function priceFlagLabel(reason: PriceFlagReason): string {
  if (reason === "no_baseline") return "ไม่มีราคาระบบ";
  if (reason === "unverified") return "ยืนยันราคาไม่ได้";
  return "ราคาแก้เอง";
}
