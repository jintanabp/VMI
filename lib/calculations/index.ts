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

/** เพดานบนของ "เขียว" — MAX + เวลารอของ + เผื่อปัดเป็นหีบเต็ม */
export function getGreenCeiling(maxDays: number): number {
  return maxDays + LEAD_TIME_DAYS + CVD_OVER_MAX_GREEN_DAYS;
}

export function getCvdFlag(
  cvdEst: number | null,
  minDays: number = FLAG_THRESHOLDS.greenMin,
  maxDays: number = FLAG_THRESHOLDS.greenMax
): CvdFlag {
  if (cvdEst === null) return "red";
  /**
   * เขียว = ไม่ต่ำกว่า MIN และไม่เกิน "เป้าที่สูตรแนะนำเล็งไว้" มากเกินไป
   *
   * สูตร calcSuggestOrder เล็งไปที่ **MAX + lead time** (เติมให้ถึง MAX แล้วบวกของที่จะขาย
   * ระหว่างรอของมาอีก 3 วัน) แล้วปัดขึ้นเป็นหีบเต็มเพราะสั่งครึ่งหีบไม่ได้
   *
   * เพดานเดิมคือ MAX + 4 ซึ่ง**ต่ำกว่าเป้าของสูตรแนะนำเองเกือบตลอด** ผลคือ 87 จาก 154 แถว
   * ที่ระบบแนะนำให้สั่ง ติดธง "ตรวจสอบ" ด้วยจำนวนที่ระบบแนะนำเอง — พอเตือนเกินครึ่ง
   * ผู้ใช้ก็เลิกอ่านคำเตือน แล้วแถวที่ควรเตือนจริงก็หายไปในกอง
   */
  const greenCeil = getGreenCeiling(maxDays);
  if (cvdEst >= minDays && cvdEst <= greenCeil) return "green";
  if (cvdEst < minDays) return "red";
  const yellowCeil = greenCeil + Math.max(15, maxDays - minDays);
  if (cvdEst <= yellowCeil) return "yellow";
  return "red";
}

/** เหตุผลของธง CVD หลังสั่ง — แยก "สั่งน้อยไป" ออกจาก "สั่งเยอะไป" เพราะรับมือคนละแบบ */
export type CvdFlagReason =
  | "under" // สั่งแล้วยังไม่ถึง MIN → เสี่ยงขาดสต็อกอยู่ดี
  | "over" // สั่งแล้วเกินเพดานมาก → ของค้างสต็อก
  | "minPack" // เกินเพดานเพราะ 1 หีบคือขั้นต่ำที่สั่งได้ ไม่ใช่เพราะสั่งเกิน
  | "outOfStock" // ของหมดแล้ว สั่งเข้ามาเท่าไรก็ยังไม่ถึง MIN — สั่งได้ ดีกว่าไม่สั่ง
  | null;

export interface OrderCvdResult {
  cvdEst: number | null;
  flag: CvdFlag | null;
  reason: CvdFlagReason;
  /**
   * true = จำนวนไม่เหมาะสมพอที่ควร "ยืนยันอีกครั้ง" ก่อนส่ง
   * ไม่ใช่การห้ามส่ง — คำแนะนำต้องไม่ทำให้ผู้ใช้ส่งออเดอร์ไม่ได้เลย
   */
  blocking: boolean;
}

/**
 * ธง CVD หลังสั่ง พร้อมเหตุผล
 *
 * เคสสำคัญ: สินค้าขายช้ามากและของหมด ระบบแนะนำ 1 หีบ แต่ 1 หีบก็พอขายได้เป็นเดือน
 * → CVD ทะลุเพดาน → เดิมติดธงแดงแล้วกั้นไม่ให้สั่ง ทั้งที่ "ไม่สั่งเลย" คือทางเลือกที่แย่กว่า
 * (ของหมดจริง) และสั่งน้อยกว่า 1 หีบก็ทำไม่ได้ จึงถือเป็น `minPack` — เตือนเหลือง สั่งได้
 */
/** สั่งน้อยกว่านี้ไม่ได้แล้วหรือยัง — ลดอีก 1 หีบแล้วของจะขาดก่อนถึง MIN */
function isSmallestFeasibleOrder(
  stock: number,
  orderQty: number,
  avgSales: number,
  minDays: number
): boolean {
  if (orderQty <= 1) return true;
  const oneLess = calcCvdEstimate(stock, orderQty - 1, avgSales);
  return oneLess !== null && oneLess < minDays;
}

export function getOrderCvdFlag(
  stock: number,
  orderQty: number,
  avgSales: number,
  minDays: number,
  maxDays: number
): OrderCvdResult {
  if (orderQty <= 0) {
    return { cvdEst: null, flag: null, reason: null, blocking: false };
  }
  // ไม่มีขายเฉลี่ย = ประเมิน CVD ไม่ได้ — ไม่ติดธงกั้นสั่ง
  if (avgSales <= 0) {
    return { cvdEst: null, flag: null, reason: null, blocking: false };
  }

  const cvdEst = calcCvdEstimate(stock, orderQty, avgSales);
  const flag = getCvdFlag(cvdEst, minDays, maxDays);

  if (flag === "green") {
    return { cvdEst, flag, reason: null, blocking: false };
  }

  // เกินเพดานแต่ "สั่งน้อยกว่านี้ไม่ได้แล้ว" → บอกว่าเป็นขั้นต่ำ ไม่ใช่ค้างคำเตือนไว้
  // (ต้องเช็คก่อนแยกเหลือง/แดง — เตือนเหลืองในเคสนี้ก็ไร้ประโยชน์เท่ากัน
  //  เพราะผู้ใช้ลดจำนวนลงไม่ได้อยู่ดี)
  if (cvdEst !== null && cvdEst > getGreenCeiling(maxDays)) {
    if (isSmallestFeasibleOrder(stock, orderQty, avgSales, minDays)) {
      return { cvdEst, flag: "yellow", reason: "minPack", blocking: false };
    }
  }

  if (flag !== "red") {
    return { cvdEst, flag, reason: null, blocking: false };
  }

  // แดงเพราะสั่งน้อยไป
  if (cvdEst !== null && cvdEst < minDays) {
    // ของหมดอยู่แล้ว → "ยังไม่ถึง MIN" เป็นเรื่องจริงแต่ไม่ใช่เหตุให้ห้ามสั่ง
    // สินค้าขายดีที่ของหมด สั่ง 1 หีบก็ได้ CVD ต่ำกว่า MIN เสมอ
    // (คลังอาจมีให้เบิกแค่นั้น หรือร้านตั้งใจเติมน้อย) — เดิมกั้นจนส่งออเดอร์ไม่ได้เลย
    if (stock <= 0) {
      return { cvdEst, flag, reason: "outOfStock", blocking: false };
    }
    return { cvdEst, flag, reason: "under", blocking: true };
  }

  return { cvdEst, flag, reason: "over", blocking: true };
}

export type { PromoResult, PromoTierInput, PromoTierKind } from "./promo";

export {
  formatPromoTierLabel,
  formatPromoTierLabelVerbose,
  getPromoForQty,
  calcNetUnitPrice,
  calcLineAmount,
  calcStepPremiumQty,
  formatPremiumUnit,
  isBenefitTier,
} from "./promo";

export type {
  OrderLinePriceSource,
  PriceFlagReason,
  PriceOverrideVerdict,
} from "./price-override";

export {
  PRICE_MATCH_EPSILON,
  evaluatePriceOverride,
  isPriceMismatch,
  priceFlagLabel,
  priceSourceLabel,
  resolveEffectivePrice,
  resolveOrderLinePrice,
  roundBaht,
} from "./price-override";

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
