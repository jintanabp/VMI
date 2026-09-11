import { listVdaWarehouses } from "@/lib/fabric/vda-warehouse-registry";
import { buildVdaSalesDirectory } from "@/lib/admin/vda-sales-directory";
import { normalizeStoreKey } from "@/lib/fabric/store-key";
import {
  DEFAULT_DIVISION_CODE,
  type ErpPayloadContext,
} from "./erp-payload";

/**
 * ประกอบข้อมูลหัวใบที่ ERP ต้องการ แต่ไม่ได้อยู่ในเอกสาร PO ของเรา
 *
 * PO ของ VMI รู้แค่ว่าเป็นของคลังไหน (`storeCode` = vda1..vda6) แต่ปลายทางถาม
 * "รหัสลูกค้า" กับ "รหัสเซลส์" ซึ่งเป็นรหัสในระบบ ERP — ทั้งสองอย่างมีทะเบียนอยู่แล้ว:
 *   - รหัสลูกค้า: `lib/fabric/vda-warehouse-registry` (แก้ได้จาก /admin/vda)
 *   - รหัสเซลส์: `lib/admin/vda-sales-directory` (มาจากทะเบียน salesman + vda_aos_bill)
 *
 * ค่าที่หาไม่ได้จะคืนเป็นสตริงว่าง **ไม่ใช่เดา** — `checkErpReadiness` จะกันใบนั้นไว้
 * พร้อมบอกว่าไปตั้งค่าที่ไหน
 */

/** "YYYY-MM-DD HH:mm:ss" ตามปฏิทินและนาฬิกาโซนไทย — รูปแบบที่ปลายทางระบุในสเปก */
export function erpDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** รหัสลูกค้าของคลังนี้ — ตัวแรกในทะเบียน (คลังหนึ่งมีได้หลายรหัส) */
export function erpCustomerCodeForVda(storeCode: string): string {
  const key = normalizeStoreKey(storeCode);
  const row = listVdaWarehouses().find((w) => normalizeStoreKey(w.code) === key);
  return row?.customerCodes[0]?.toUpperCase() ?? "";
}

/**
 * รหัสเซลส์ที่ดูแลคลังนี้ — ตัวแรกในทะเบียน
 *
 * **ยืนยันแล้ว 11 ก.ย. 69: ส่งรหัส "คนที่ดูแลคลังนั้น" ไม่ใช่คนที่กดอนุมัติใบ**
 *
 * ซึ่งเป็นคำตอบที่ปลอดภัยกว่าด้วย: ปลายทางตีกลับเป็น `RECORDSTATUS = 5` เมื่อลูกค้า
 * ไม่อยู่ในลิสต์ CFM ของเซลส์คนที่ส่ง ⇒ ถ้าส่งรหัสของคนที่กดอนุมัติแล้วคนนั้นไม่ได้ถือ
 * ลูกค้ารายนั้น ใบจะเข้าไปก่อนแล้วค่อยตกทีหลังแบบเงียบ ๆ ไม่ใช่ 400 ตอนยิง
 */
export function erpSalesmanCodeForVda(storeCode: string): string {
  const key = normalizeStoreKey(storeCode);
  try {
    const dir = buildVdaSalesDirectory();
    const row = dir.vdas.find((v) => normalizeStoreKey(v.vda) === key);
    return row?.salesmanCodes[0] ?? "";
  } catch {
    // ทะเบียนยังไม่โหลด (master ไม่พร้อม) — คืนว่างให้ตัวตรวจความพร้อมกันใบไว้
    return "";
  }
}

/**
 * `deliveryDate` — **วันที่ร้านเลือกเองตอนกดส่งออเดอร์** (พี่เคาะ 11 ก.ย. 69)
 *
 * เดิมคืน `null` เสมอเพราะ VMI ไม่มีวันนัดส่งในระบบเลย · ตอนนี้ร้านเลือกได้ที่หน้ากดส่ง
 * เริ่มที่วันนี้ + `LEAD_TIME_DAYS` และเลื่อนออกไปได้ (ดู `lib/orders/delivery-date.ts`)
 *
 * ส่งเป็น **เที่ยงคืน** ตามที่ฝั่ง ocr ส่งมาตลอด (`… 00:00:00`) เพราะปลายทางเก็บเป็น
 * `DELIVERYDATE DATE` — เวลาไม่มีความหมาย แต่รูปแบบต้องครบ
 *
 * ยังคืน `null` ได้อยู่สำหรับออเดอร์ที่ส่งก่อนมีฟีเจอร์นี้ ⇒ ใบนั้นติด
 * `missing_delivery_date` ตามเดิม **ห้ามเดาวันแทนร้าน** — payload ที่ดูสมบูรณ์
 * ทั้งที่วันส่งเป็นการเดา คือสิ่งที่ทำให้ของไปผิดวันโดยไม่มีใครรู้ว่าใครกำหนด
 */
export function erpDeliveryDate(deliveryDate: string | null): string | null {
  if (!deliveryDate) return null;
  return `${deliveryDate} 00:00:00`;
}

export function buildErpContext(args: {
  storeCode: string;
  approvedAt: string | Date;
  /** วันที่ร้านเลือก — มาจาก `PoDocument.deliveryDate` */
  deliveryDate: string | null;
}): ErpPayloadContext {
  const approved =
    args.approvedAt instanceof Date ? args.approvedAt : new Date(args.approvedAt);
  return {
    customerCode: erpCustomerCodeForVda(args.storeCode),
    salesmanCode: erpSalesmanCodeForVda(args.storeCode),
    divisionCode: DEFAULT_DIVISION_CODE,
    createDate: erpDateTime(approved),
    deliveryDate: erpDeliveryDate(args.deliveryDate),
  };
}
