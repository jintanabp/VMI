/**
 * เกณฑ์รหัสผ่าน — **ไม่มี dependency ของ Node เลย** เพื่อให้ฝั่งเบราว์เซอร์ import ได้ด้วย
 *
 * แยกออกจาก `store-password.ts` เพราะไฟล์นั้น import `crypto` ซึ่งลากเข้า bundle ฝั่ง client ไม่ได้
 * ฟอร์มเปลี่ยนรหัสในหน้า /manage ต้องบอกผู้ใช้ได้ตั้งแต่ยังไม่กดส่งว่ารหัสสั้นไป และข้อความนั้น
 * ต้องเป็นข้อความเดียวกับที่เซิร์ฟเวอร์จะตอบ ไม่งั้นสองฝั่งเถียงกันเองต่อหน้าผู้ใช้
 */

/** ความยาวขั้นต่ำที่รับได้ — โชว์บนฟอร์มด้วย ไม่ใช่ซ่อนไว้จนกดส่งแล้วค่อยบอก */
export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;

/**
 * ตรวจความแข็งแรงของรหัสขั้นต่ำ — บังคับเฉพาะตอน "ตั้งใหม่"
 * รหัสเดิมที่สั้นกว่านี้ยังใช้เข้าระบบได้ (verify ไม่เรียกฟังก์ชันนี้)
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LEN) {
    return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LEN} ตัวอักษร`;
  }
  if (password.length > PASSWORD_MAX_LEN) {
    return "รหัสผ่านยาวเกินไป";
  }
  return null;
}
