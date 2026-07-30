/**
 * ค่า MIN/MAX เริ่มต้น (วัน) เมื่อร้านไม่ได้ตั้งค่ารายกลุ่ม/ราย SKU
 *
 * แยกไฟล์ไว้เพราะ thresholds-service.ts ดึง prisma + lib/fabric เข้ามา
 * ซึ่งใช้ `fs` — client component ที่ import ค่าคงที่จากที่นั่นจะทำให้ build พัง
 */
export const DEFAULT_MIN_DAYS = 7;
export const DEFAULT_MAX_DAYS = 15;
