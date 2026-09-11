import { LEAD_TIME_DAYS } from "@/lib/calculations";
import { bangkokDateStr, daysBetweenIso } from "@/lib/fabric/bkk-date";

/**
 * วันที่ร้านอยากรับของ — เลือกตอนกดส่งออเดอร์
 *
 * ปลายทาง ERP บังคับฟิลด์ `deliveryDate` และ VMI ไม่เคยมีวันนัดส่งเก็บไว้เลย
 * พี่เคาะเมื่อ 11 ก.ย. 69 ว่า **ให้ร้านเลือกเองตอนกดส่ง เริ่มที่สามวันถัดไป
 * และเลื่อนไปหลังจากนั้นได้**
 *
 * ## ทำไม "สามวัน" ไม่ใช่เลขที่ตั้งขึ้นมาลอย ๆ
 * มันคือ `LEAD_TIME_DAYS` ตัวเดียวกับที่สูตรแนะนำจำนวนสั่งใช้อยู่แล้ว —
 * `calcSuggestOrder` บวกของที่จะขายได้ระหว่างรอของมาสามวันเข้าไปในจำนวนที่แนะนำ
 * ⇒ ถ้าวันรับของเร็วกว่านั้น จำนวนที่ระบบแนะนำจะเผื่อเกินความจริง
 * ผูกกับค่าเดียวกันไว้ สองที่จึงขยับพร้อมกันเสมอถ้าวันหนึ่ง lead time เปลี่ยน
 *
 * ## ทุกอย่างเป็นสตริง YYYY-MM-DD บนปฏิทินไทย
 * ไม่ใช่ `Date` เพราะเซิร์ฟเวอร์กับเบราว์เซอร์อาจคนละโซน แล้ว "พรุ่งนี้" ของสองฝั่ง
 * จะไม่ตรงกันช่วงหัวค่ำ — ปัญหาเดียวกับที่ `bkk-date.ts` มีอยู่เพื่อแก้
 */

/** วันรับของที่เร็วที่สุดที่เลือกได้ = วันนี้ (เวลาไทย) + lead time */
export function earliestDeliveryDate(now: Date = new Date()): string {
  return addDays(bangkokDateStr(now), LEAD_TIME_DAYS);
}

/** ค่าตั้งต้นในช่องเลือกวัน — เท่ากับวันที่เร็วที่สุด ร้านเลื่อนออกไปได้ */
export function defaultDeliveryDate(now: Date = new Date()): string {
  return earliestDeliveryDate(now);
}

/** บวกวันบนสตริง YYYY-MM-DD โดยไม่แตะโซนเวลา */
export function addDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** เลือกได้ไกลสุดกี่วัน — กันพิมพ์ปีผิดจนกลายเป็นปี 2099 */
export const DELIVERY_DATE_MAX_AHEAD_DAYS = 90;

/**
 * ตรวจวันที่ร้านเลือก — คืนข้อความไทยเมื่อไม่ผ่าน, `null` เมื่อผ่าน
 *
 * เซิร์ฟเวอร์ต้องเรียกตัวนี้ด้วย ไม่ใช่เชื่อค่าจากหน้าจอ — ช่อง `<input type="date">`
 * มี `min` ก็จริงแต่ยิง API ตรงข้ามไปได้
 */
export function checkDeliveryDate(
  value: string,
  now: Date = new Date()
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "รูปแบบวันที่ไม่ถูกต้อง";
  }
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return "ไม่มีวันที่นี้ในปฏิทิน";
  }

  const earliest = earliestDeliveryDate(now);
  const ahead = daysBetweenIso(earliest, value);
  if (ahead < 0) {
    return `รับของเร็วที่สุดได้วันที่ ${thaiShortDate(earliest)} (ต้องเผื่อเวลาส่งของ ${LEAD_TIME_DAYS} วัน)`;
  }
  if (ahead > DELIVERY_DATE_MAX_AHEAD_DAYS) {
    return `เลือกล่วงหน้าได้ไม่เกิน ${DELIVERY_DATE_MAX_AHEAD_DAYS} วัน`;
  }
  return null;
}

/** `2026-08-31` → `31 ส.ค. 69` — รูปแบบเดียวกับที่ใช้ทั้งแอป */
export function thaiShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
