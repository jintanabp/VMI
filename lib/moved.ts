/**
 * ระบบย้ายไปที่ใหม่แล้ว — มีค่า = ทุกหน้าของลิงก์เก่าขึ้นหน้าแจ้งย้าย พร้อมปุ่มกดไปลิงก์ใหม่
 *
 * ผู้ใช้ขอ 2 พ.ย. 69: เปิด https://spc-ai.sahapat.com/vmi/ แล้วให้กดไปที่ใหม่ได้ (ไม่ได้ย้ายตัวแอป)
 * อยู่ในโค้ดไม่ใช่ env (ผู้ใช้ไม่อยากแก้ env บนเซิร์ฟเวอร์) · ตั้งเป็น `null` = กลับมาเปิดใช้ตามปกติ
 * API (รวม /api/health ที่ docker ใช้ตรวจ) ยังทำงานตามเดิม — ปิดแค่หน้าเว็บ
 */
export const MOVED_TO_URL: string | null = "https://saai.sahapat.com/vda/";

/**
 * ผู้ดูแลระบบยังเข้าระบบเก่าได้ (ดูออเดอร์เก่า) — ผู้ใช้ขอ 2 พ.ย. 69
 *
 * cookie นี้ตั้งจากลิงก์ "ผู้ดูแลระบบ" บนหน้าแจ้งย้าย (`/api/legacy-access`) มีไว้ให้**หน้า login ไม่ถูกบัง**
 * อย่างเดียว ไม่ได้ให้สิทธิ์อะไร — login แล้วถ้าไม่ใช่ creator/admin ก็กลับไปเห็นหน้าแจ้งย้ายเหมือนเดิม
 */
export const LEGACY_ACCESS_COOKIE = "vmi_legacy_access";

/**
 * หน้านี้ควรเปิดตามปกติไหม (ระบบย้ายแล้ว)
 * - creator / admin login อยู่ → ใช่
 * - กดลิงก์ผู้ดูแลระบบมาแล้ว แต่ยังไม่ได้ login ใครเลย (หน้า login / auth callback) → ใช่
 * - นอกนั้น (ร้าน / เซลล์ / คนทั่วไป) → ไม่ ขึ้นหน้าแจ้งย้าย
 */
export function legacySiteAllowed(args: {
  isAdmin: boolean;
  hasLegacyCookie: boolean;
  hasAnySession: boolean;
}): boolean {
  if (args.isAdmin) return true;
  return args.hasLegacyCookie && !args.hasAnySession;
}
