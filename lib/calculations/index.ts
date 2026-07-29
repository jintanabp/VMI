export const LEAD_TIME_DAYS = 3;

/** CVD หลังสั่งเกิน MAX ได้ไม่เกินกี่วัน ยังถือว่าเขียว (เผื่อ lead time) */
export const CVD_OVER_MAX_GREEN_DAYS = 4;

export const FLAG_THRESHOLDS = {
  greenMin: 7,
  greenMax: 20,
  yellowMax: 35,
} as const;

export type CvdFlag = "green" | "yellow" | "red";

export function calcMinStock(avgSales: number, minDays: number): number {
  return avgSales * minDays;
}

export function calcMaxStock(avgSales: number, maxDays: number): number {
  return avgSales * maxDays;
}

export function calcStockCvd(stock: number, avgSales: number): number | null {
  if (avgSales <= 0) return null;
  return stock / avgSales;
}

export function calcSuggestOrder(
  stock: number,
  avgSales: number,
  minDays: number,
  maxDays: number,
  leadTimeDays = LEAD_TIME_DAYS
): number {
  const minStock = calcMinStock(avgSales, minDays);
  const maxStock = calcMaxStock(avgSales, maxDays);

  if (stock >= minStock) return 0;

  const raw = maxStock - stock + avgSales * leadTimeDays;
  return Math.ceil(raw);
}

/**
 * แยกจำนวนชิ้นเป็น "หีบเต็ม + เศษ"
 * stock_cover_day นับเป็นชิ้น แต่ราคา/โปร C4/ออเดอร์ นับเป็นหีบ
 */
export function piecesToCases(
  pieces: number,
  packSize: number
): { cases: number; remainder: number } {
  const p = packSize > 0 ? packSize : 1;
  const cases = Math.floor(pieces / p);
  return { cases, remainder: Math.round(pieces - cases * p) };
}

/** "209" เมื่อครบหีบพอดี, "2 · 9" เมื่อมีเศษ (หีบ · เศษชิ้น) */
export function formatCaseRemainder(cases: number, remainder: number): string {
  const c = formatNumber(cases, 0);
  if (remainder <= 0) return c;
  return `${c} · ${formatNumber(remainder, 0)}`;
}

export function calcCvdEstimate(
  stock: number,
  orderQty: number,
  avgSales: number
): number | null {
  if (avgSales <= 0) return null;
  return (stock + orderQty) / avgSales;
}

export function getCvdFlag(
  cvdEst: number | null,
  minDays: number = FLAG_THRESHOLDS.greenMin,
  maxDays: number = FLAG_THRESHOLDS.greenMax
): CvdFlag {
  if (cvdEst === null) return "red";
  // เขียว = ไม่ต่ำกว่า MIN และเกิน MAX ได้ไม่เกิน ~3–4 วัน (เผื่อ lead time)
  const greenCeil = maxDays + CVD_OVER_MAX_GREEN_DAYS;
  if (cvdEst >= minDays && cvdEst <= greenCeil) return "green";
  if (cvdEst < minDays) return "red";
  const yellowCeil = greenCeil + Math.max(15, maxDays - minDays);
  if (cvdEst <= yellowCeil) return "yellow";
  return "red";
}

export type { PromoResult, PromoTierInput, PromoTierKind } from "./promo";

export {
  formatPromoTierLabel,
  getPromoForQty,
  calcNetUnitPrice,
  calcLineAmount,
  calcStepPremiumQty,
  formatPremiumUnit,
  isBenefitTier,
} from "./promo";

export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDays(value: number | null): string {
  if (value === null) return "-";
  return `${formatNumber(value, 1)} วัน`;
}

/** จำนวนเงินบาท (จำนวนเต็ม) — รูปแบบเดียวทั้งแอป */
export function formatBaht(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${formatNumber(value, 0)} บาท`;
}
