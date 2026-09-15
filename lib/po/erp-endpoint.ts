/**
 * ปลายทางของการส่ง PO เข้า ERP — **คอนฟิกอยู่ในโค้ด ไม่ใช่ env**
 *
 * เหตุผลเดียวกับ `DEFAULT_DIVISION_CODE` ใน erp-payload.ts: ไม่ต้องไปแก้ env บนเซิร์ฟเวอร์
 * แล้ว restart ทุกครั้งที่อยากเปลี่ยนอะไร · ผู้ใช้เคาะทางนี้เมื่อ 11 ก.ย. 69
 *
 * ## มีแค่ UAT เท่านั้นในไฟล์นี้ และนั่นคือเจตนา
 * โฮสต์ production (`spcws.sahapat.com`) **ไม่ถูกเขียนไว้ที่ไหนในโค้ดที่รันได้เลย**
 * ยิง production ผิดใบเดียว = คู่ `orderNo` + `customerCode` ถูกล็อก **6 เดือน** และ
 * ฝั่ง ERP ไม่มีทาง override หรือ resend ⇒ เลข PO ใบนั้นเผาทิ้ง
 * การจะสลับไป prod วันหนึ่งจึงต้องแก้โค้ดแล้ว deploy โดยตั้งใจ ไม่ใช่พิมพ์ env ผิดตัวเดียว
 *
 * ที่มาของค่า: `ocr-po-matching/.env.example` ซึ่งเป็นค่าที่ระบบ OCR ใช้งานจริง
 * UAT กับ prod ต่างกัน**แค่ชื่อโฮสต์** path/request/response เหมือนกันทุกอย่าง
 * (SPC IT ยืนยัน 30 ส.ค. 69)
 */

/** UAT — ปลายทางเดียวที่โค้ดนี้รู้จัก */
export const ERP_UAT_URL =
  "https://spcuatws.sahapat.com/spc/ocr/insertOCROrderToBill";

/** ค่าเดียวกับที่ฝั่ง ocr ใช้ */
export const ERP_TIMEOUT_MS = 15_000;

/**
 * สวิตช์ส่งจริง — **เปิดแล้ว 14 ก.ย. 69**
 *
 * ประกาศชนิดเป็น `boolean` ไม่ใช่ literal โดยตั้งใจ เพื่อไม่ให้ TypeScript แคบค่าจนโค้ด
 * อีกฝั่งกลายเป็น dead branch ที่เทสต์เข้าไม่ถึง
 *
 * **อัปเดต 14 ก.ย. 69:** พี่สั่งเปิดสวิตช์แล้ว แต่**ยังไม่ให้ทดลองส่งจริง** — เปิดไว้ให้พร้อม
 * ก่อนเท่านั้น ที่เหลือคือรอออเดอร์ทดสอบ (มี delivery date) แล้วค่อยตัดสินใจกดส่งจริงทีหลัง ·
 * ยังชี้ไปที่ `ERP_UAT_URL` เท่านั้น — โฮสต์ prod ไม่มีอยู่ในไฟล์นี้เลย (ดูหัวไฟล์)
 */
const SEND_ENABLED: boolean = true;

export interface ErpEndpoint {
  url: string;
  timeoutMs: number;
}

/**
 * ปลายทางที่ใช้ได้ตอนนี้ — `null` = ยังไม่เปิดให้ส่ง
 *
 * ผู้เรียกที่ได้ `null` ต้องปิดปุ่มพร้อมเหตุผล ไม่ใช่เงียบ ๆ แล้วไม่ทำอะไร
 */
export function erpEndpoint(): ErpEndpoint | null {
  if (!SEND_ENABLED) return null;
  return { url: ERP_UAT_URL, timeoutMs: ERP_TIMEOUT_MS };
}

/**
 * ข้อความบอกผู้ใช้ว่าทำไมส่งไม่ได้ — ใช้เป็น title ของปุ่มที่ถูกปิด
 *
 * **ต้องแก้พร้อม `SEND_ENABLED` เสมอ** — 11 ก.ย. เคยค้างไว้ว่า "รอ deliveryDate"
 * ทั้งที่เรื่องนั้นตอบและทำเสร็จไปแล้ว ข้อความที่อ้างเหตุผลเก่าทำให้คนไปตามเรื่องที่จบแล้ว
 */
export const ERP_SEND_DISABLED_REASON =
  "ยังไม่เปิดให้ส่งเข้า ERP — โค้ดพร้อมแล้ว รอคำสั่งเปิดสวิตช์ (ตอนนี้ชี้ UAT เท่านั้น)";
