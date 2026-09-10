/**
 * กติกาค่า MIN / MAX ที่ร้านตั้งได้ — **แหล่งความจริงเดียว** ของทั้งหน้าจอและ API
 *
 * แยกออกมาเพราะเดิมมีสามมาตรฐานอยู่ในระบบเดียวกัน:
 *   1. แผง "ตั้งค่าหลายแบรนด์" ตรวจค่า แต่ปล่อยช่องว่างผ่าน (`Number("")` = 0 ไม่ใช่ NaN)
 *      → ลบเลขทิ้งทั้งสองช่องแล้วกดบันทึกได้ = เขียน MIN 0 / MAX 0 ทับหลายสิบแบรนด์รวดเดียว
 *   2. แถวรายแบรนด์และรายสินค้า ไม่ตรวจอะไรเลย — พิมพ์ MAX 2 / MIN 20 ก็กดบันทึกได้
 *   3. ฝั่ง API `parseDays` เจอค่าติดลบแล้ว**แทนด้วยค่าเริ่มต้นเงียบ ๆ** แล้วตอบ 200
 *      ผู้ใช้เห็นเครื่องหมายถูกและเชื่อว่าบันทึก -5 ไปแล้ว ทั้งที่ในฐานข้อมูลเป็น 7
 */

/** ข้อความบอกปัญหาของค่าที่ผู้ใช้พิมพ์ — null = ใช้ได้ (ข้อความเอาไปโชว์บนจอได้เลย) */
export function daysError(minRaw: string, maxRaw: string): string | null {
  if (!minRaw.trim() || !maxRaw.trim()) return "กรอก MIN และ MAX ให้ครบ";
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isInteger(min) || !Number.isInteger(max))
    return "MIN / MAX ต้องเป็นจำนวนเต็ม (วัน)";
  if (min < 0) return "MIN ต้องไม่ติดลบ";
  if (max < 1) return "MAX ต้องอย่างน้อย 1 วัน";
  if (max < min) return "MAX ต้องไม่น้อยกว่า MIN";
  if (max > 365) return "MAX ต้องไม่เกิน 365 วัน";
  return null;
}

/**
 * ค่าที่ส่งเข้า API ใช้ไม่ได้หรือเปล่า — ไม่ส่งฟิลด์มาเลยถือว่า "ไม่ได้ตั้งใจแก้" (ใช้ค่า default ได้)
 * แต่ส่งมาเป็นค่าที่แปลไม่ได้ ต้องตอบ 400 ไม่ใช่แอบเปลี่ยนค่าให้แล้วบอกว่าสำเร็จ
 */
export function isInvalidDaysValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  const n = Number(v);
  return !Number.isFinite(n) || n < 0 || !Number.isInteger(n);
}
