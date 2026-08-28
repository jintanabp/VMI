/**
 * แปลงข้อความ error จาก API ให้เป็นภาษาที่ผู้ใช้อ่านรู้เรื่อง
 *
 * API หลายเส้นคืน `"Forbidden"` / `"Unauthorized"` ตรง ๆ (ราว 30 ไฟล์) แล้วฝั่ง
 * client เอาไปแสดงด้วย `setError(data.error ?? "...")` ผลคือพนักงานร้านเห็นคำ
 * ภาษาอังกฤษที่ไม่มีความหมายกับงานของตัวเอง และไม่รู้ว่าต้องทำอะไรต่อ
 *
 * แก้ที่จุดแสดงผลแทนการไล่แก้ทุก route เพราะข้อความพวกนี้เป็นส่วนหนึ่งของ
 * contract ที่ client อื่นอาจเช็คอยู่ และจุดแสดงผลมีน้อยกว่ามาก
 */
const MAP: Record<string, string> = {
  unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้",
  "not found": "ไม่พบข้อมูลที่ต้องการ",
  "promotion master not loaded":
    "ข้อมูลโปรโมชั่นยังไม่พร้อม — แจ้งผู้ดูแลระบบให้ดึงข้อมูลใหม่",
  "internal server error": "ระบบขัดข้องชั่วคราว กรุณาลองใหม่",
};

/**
 * @param raw ข้อความที่ API ส่งมา (อาจเป็น undefined)
 * @param fallback ข้อความเมื่อไม่มีอะไรส่งมาเลย
 */
export function friendlyError(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  const mapped = MAP[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  // ข้อความไทยที่ route เขียนไว้เองอยู่แล้วให้ผ่านไปตามเดิม
  return raw;
}
