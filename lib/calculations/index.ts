export const LEAD_TIME_DAYS = 3;

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

export function getCvdFlag(cvdEst: number | null): CvdFlag {
  if (cvdEst === null) return "red";
  if (cvdEst < FLAG_THRESHOLDS.greenMin || cvdEst > FLAG_THRESHOLDS.yellowMax) {
    return "red";
  }
  if (cvdEst > FLAG_THRESHOLDS.greenMax) return "yellow";
  return "green";
}

export interface PromoTierInput {
  minQty: number;
  discount: string;
  sortOrder: number;
  kind?: import("./promo").PromoTierKind;
  premiumProduct?: string;
  premiumQty?: number;
}

export type { PromoResult, PromoTierKind } from "./promo";

export {
  formatPromoTierLabel,
  getPromoForQty,
  calcNetUnitPrice,
  calcLineAmount,
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
