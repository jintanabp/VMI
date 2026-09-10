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
 * ยังต้องให้ทีม ERP ยืนยันว่าควรส่งรหัสเซลส์ของคลัง หรือรหัสของคนที่กดอนุมัติใบนั้น
 * (คำถามข้อ 5 ในแผน) — ถ้าคำตอบเป็นอย่างหลัง จุดที่ต้องแก้คือฟังก์ชันนี้จุดเดียว
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
 * `deliveryDate` — **ยังไม่รู้กติกา ต้องถามทีม ERP ก่อน**
 *
 * VMI ไม่มี "วันนัดส่ง" ในระบบเลย (ต่างจากฝั่ง ocr-po-matching ที่เซลส์กรอกจากใบ PO
 * ของลูกค้า) ตัวเลือกที่คุยกันไว้: วันอนุมัติ + lead time, ให้เซลส์เลือกตอนกดส่ง,
 * หรือใช้วันอนุมัติเลย — ทั้งสามมีผลกับคิวส่งของจริง จึงต้องรอคำตอบ
 *
 * จนกว่าจะได้คำตอบ ฟังก์ชันนี้คืน `null` เสมอ ⇒ ทุกใบขึ้นว่า "ยังส่งไม่ได้"
 * **ห้ามเดาแล้วปล่อยเงียบ** — payload ที่ดูสมบูรณ์ทั้งที่วันส่งเป็นการเดา
 * คือสิ่งที่จะทำให้ของไปผิดวันโดยไม่มีใครรู้ว่าใครกำหนด
 */
export function erpDeliveryDate(): string | null {
  return null;
}

export function buildErpContext(args: {
  storeCode: string;
  approvedAt: string | Date;
}): ErpPayloadContext {
  const approved =
    args.approvedAt instanceof Date ? args.approvedAt : new Date(args.approvedAt);
  return {
    customerCode: erpCustomerCodeForVda(args.storeCode),
    salesmanCode: erpSalesmanCodeForVda(args.storeCode),
    divisionCode: DEFAULT_DIVISION_CODE,
    createDate: erpDateTime(approved),
    deliveryDate: erpDeliveryDate(),
  };
}
