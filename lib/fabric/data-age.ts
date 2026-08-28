/**
 * เกณฑ์ "ข้อมูลกลางเก่าเกินไป" — ใช้ร่วมกันระหว่าง scheduler (ไล่ตามรอบที่พลาด)
 * กับ payload ที่ส่งให้หน้าร้าน (เตือนว่ากำลังดูข้อมูลค้าง)
 *
 * แยกออกมาเป็นไฟล์เปล่า ๆ เพราะ stock-rows ต้องใช้ค่านี้ แต่ import จาก scheduler
 * จะวนกลับมาที่ fabric/index
 */
export function maxDataAgeHours(): number {
  const n = Number(process.env.MASTER_REFRESH_MAX_AGE_HOURS ?? "20");
  return Number.isFinite(n) && n > 0 ? n : 20;
}
