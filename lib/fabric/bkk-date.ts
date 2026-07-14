/** เครื่องมือเทียบ "วันที่ทางธุรกิจ" แบบโซน Asia/Bangkok
 *
 * ปัญหาที่แก้: fromDate/toDate จาก CSV parse ด้วย Date.parse("YYYY-MM-DD")
 * ได้เป็น UTC เที่ยงคืน แต่ `new Date()` เป็น instant จริง (มีเวลา + โซน)
 * การเทียบ Date สองแบบนี้ตรง ๆ ทำให้ "วันสุดท้าย" ของโปร/ราคาหลุด และเลื่อน ~7 ชม.
 * แก้โดยเทียบเป็น string วันที่ (YYYY-MM-DD) บนปฏิทินโซนไทยทั้งคู่
 */

/** วันที่ YYYY-MM-DD ตามปฏิทินโซน Asia/Bangkok ของ instant ที่ให้มา */
export function bangkokDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/** วันที่ YYYY-MM-DD ของ Date ที่ parse มาจาก "YYYY-MM-DD" (เก็บเป็น UTC เที่ยงคืน) */
export function isoDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** จำนวนวันจาก a → b (YYYY-MM-DD ทั้งคู่) เป็นจำนวนเต็ม (b - a) */
export function daysBetweenIso(a: string, b: string): number {
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.round(ms / 86_400_000);
}
