import { bangkokDateStr, isoDateStr } from "./bkk-date";

/**
 * เฝ้าดูว่าไฟล์ C4 ในเครื่องมีโปรของเดือนปัจจุบันแล้วหรือยัง
 *
 * ทำไมต้องมี: ตาราง C4 บน Fabric ถูกโหลดใหม่ราว 14:30 ทุกวัน (ดู UpdateDate ในไฟล์)
 * แต่รอบ sync ประจำวันของเราอยู่ 03:30 ⇒ วันที่ 1 ของเดือน รอบ 03:30 ได้ไฟล์ของเดือนก่อน
 * แล้วต้องรอถึง 03:30 วันรุ่งขึ้น หน้าโปร C4 จึงว่างเกือบทั้งวันที่ 1 (เกิดจริง 1 ต.ค. 69)
 *
 * แก้โดยเช็คทุกชั่วโมง: ถ้าไฟล์ยังไม่มีแถวไหนทับเดือนนี้ ให้ดึงเฉพาะ C4 (ไฟล์ ~350KB)
 * พอเจอแถวของเดือนใหม่แล้วก็หยุดดึงเองจนถึงต้นเดือนถัดไป
 */

/** เช็คทุกกี่นาที — ไฟล์เล็ก ดึงบ่อยได้ แต่ต้นทางเปลี่ยนวันละครั้ง ชั่วโมงละครั้งพอ */
export const PROMO_MONTH_WATCH_INTERVAL_MS = 60 * 60_000;

/** ต้นเดือน-สิ้นเดือนของเดือนปัจจุบันตามปฏิทินไทย (YYYY-MM-DD) */
function currentBangkokMonth(now: Date): { from: string; to: string } {
  const today = bangkokDateStr(now);
  const [y, m] = today.split("-").map((s) => Number.parseInt(s, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = today.slice(0, 7);
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * มีแถวไหนใช้ได้ช่วงใดก็ได้ในเดือนนี้ไหม — เกณฑ์เดียวกับหน้าโปร C4
 * (promoOverlapsMonth) ไม่งั้นตัวเฝ้าจะเลิกดึงทั้งที่หน้าเว็บยังว่าง
 */
export function promoRowsCoverCurrentMonth(
  rows: Iterable<{ fromDate: Date | null; toDate: Date | null }>,
  now: Date = new Date()
): boolean {
  const { from, to } = currentBangkokMonth(now);
  for (const row of rows) {
    if (row.fromDate && isoDateStr(row.fromDate) > to) continue;
    if (row.toDate && isoDateStr(row.toDate) < from) continue;
    return true;
  }
  return false;
}
