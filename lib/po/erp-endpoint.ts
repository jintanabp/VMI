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
 * สวิตช์ส่งจริง — **ปิดไว้**
 *
 * ประกาศชนิดเป็น `boolean` ไม่ใช่ literal โดยตั้งใจ เพื่อไม่ให้ TypeScript แคบค่าจนโค้ด
 * อีกฝั่งกลายเป็น dead branch ที่เทสต์เข้าไม่ถึง
 *
 * ยังปิดอยู่เพราะ**ยังไม่รู้ว่า `deliveryDate` ต้องใส่วันไหน** (คำถามข้อ 4.1) —
 * ถึงเปิดตอนนี้ก็ส่งไม่ออกอยู่ดี `checkErpReadiness` ติด `missing_delivery_date` ทุกใบ 100%
 * สวิตช์นี้จึงเป็นล็อกชั้นที่สอง ไม่ใช่ชั้นเดียว
 */
const SEND_ENABLED: boolean = false;

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

/** ข้อความบอกผู้ใช้ว่าทำไมส่งไม่ได้ — ใช้เป็น title ของปุ่มที่ถูกปิด */
export const ERP_SEND_DISABLED_REASON =
  "ยังไม่เปิดให้ส่งเข้า ERP — รอทีม ERP ยืนยันว่า deliveryDate ต้องใช้วันไหน และขอรหัสลูกค้าสำหรับทดสอบ";
