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
