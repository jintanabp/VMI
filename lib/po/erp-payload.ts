import { checkPoNumberFormat, PO_NUMBER_MAX_LEN } from "./po-number";
import type { PoDocument } from "./po-document";

/**
 * ประกอบ payload ของ ERP `insertOCROrderToBill` จากเอกสาร PO ของเรา — **pure ทั้งไฟล์**
 *
 * ปลายทางคือ `POST /spc/ocr/insertOCROrderToBill` ที่ INSERT ลงตาราง Oracle
 * `OCR_ORDER_TO_BILL` **ตารางเดียวกับที่ระบบ ocr-po-matching ใช้** สเปกเต็มอยู่ที่
 * `ocr-po-matching/Spec API/ocr-insertOCROrderToBill.md` (UAT) และ
 * `ocr-po-matching/docs/ocr-insertOCROrderToBill-prod.md` (prod — มี isErrorC4 เพิ่ม)
 *
 * ⚠️ ไฟล์นี้**ไม่ยิงอะไรออกไปไหน** มีหน้าที่เดียวคือแปลงข้อมูลให้ถูกรูปและตรวจว่าครบไหม
 * การส่งจริงเป็นงานเฟส 2 ที่ต้องรอทีม ERP ตอบเรื่อง deliveryDate และรอ UAT ก่อน
 * เหตุผลที่ต้องรอ: ยิง production ผิดใบเดียว คู่ orderNo+customerCode จะถูกล็อก **6 เดือน**
 *
 * ## ทำไมไม่ส่งของแถม
 * สเปกกำหนดว่าออเดอร์ปกติ (`isSpecial` ว่าง) **ห้ามมีบรรทัด `buyOrFree: "F"`**
 * เพราะระบบวางบิลจะคิดโปรโมชั่นใหม่จาก C4 เอง — ส่ง F ไปจะได้ของแถมสองเท่า
 * โครงข้อมูลของ VMI เข้ากับกติกานี้พอดี เพราะเก็บของแถมเป็น attribute ของบรรทัดซื้อ
 * (`PoDocumentLine.freeGood`) ไม่ใช่บรรทัดแยก จึงไม่มีอะไรต้องกรองออก
 *
 * ส่วน `isSpecial=Y` (ล็อกของแถมตามที่เราคิด) และ `isErrorC4=Y` (ธง "ราคาไม่ตรง C4"
 * ซึ่งสเปกบังคับให้มาคู่กับ isSpecial) **ผู้ใช้สั่งไม่ให้ใช้** จึงไม่มีในไฟล์นี้เลย
 */

/** VAT 7% — ค่าเดียวกับ po-document.ts และ erp_export.py ของ ocr-po-matching */
export const ERP_VAT_RATE = 0.07;

/**
 * ความยาวสูงสุดของ `orderNo` ที่ปลายทางรับ — ใช้ค่าเดียวกับ po-number.ts
 * (ไฟล์นั้นอ้าง ocr-po-matching ไว้แล้วเพราะปลายทาง Oracle เดียวกัน) ห้ามประกาศเลขซ้ำ
 */
export const ERP_ORDER_NO_MAX = PO_NUMBER_MAX_LEN;

/** ค่า divisionCode ที่ใช้กับลูกค้าคลัง VDA
 *
 *  มาจาก `cfm_customer_reference.csv` ที่ Bronze ซึ่งระบุ `DIVISIONSALE = E`
 *  สำหรับลูกค้าของ vda1–vda5 ทุกราย · **ยังต้องให้ทีม ERP ยืนยัน** ก่อนส่งจริง
 *  (อยู่ในโค้ดไม่ใช่ env เพราะผู้ใช้ไม่ต้องการแก้ env บนเซิร์ฟเวอร์) */
export const DEFAULT_DIVISION_CODE = "E";

export interface ErpOrderDetail {
  productCode: string;
  promotionTo: string;
  quantityCase: number;
  quantityUnit: "B" | "P";
  discountPercent: number;
  discountUnit: number;
  unitPrice: number;
  amount: number;
  vatAmount: number;
  buyOrFree: "B" | "F";
}

export interface ErpOrderPayload {
  orderNo: string;
  customerCode: string;
  salesmanCode: string;
  divisionCode: string;
  createDate: string;
  /** null = ยังไม่รู้กติกา (รอทีม ERP) — ตัวตรวจความพร้อมจะกันใบนี้ไว้ */
  deliveryDate: string | null;
  countItem: number;
  orderDetail: ErpOrderDetail[];
}

export interface ErpPayloadContext {
  /** รหัสลูกค้าของคลังนี้ — จาก lib/fabric/vda-warehouse-registry */
  customerCode: string;
  /** รหัสเซลส์ที่ดูแลคลังนี้ — จาก lib/admin/vda-sales-directory */
  salesmanCode: string;
  divisionCode: string;
  /** "YYYY-MM-DD HH:mm:ss" เวลาไทย */
  createDate: string;
  /** "YYYY-MM-DD HH:mm:ss" เวลาไทย — null เมื่อยังไม่รู้กติกา */
  deliveryDate: string | null;
}

export type ErpReason =
  | "missing_po_number"
  | "po_number_invalid"
  | "missing_customer_code"
  | "missing_salesman_code"
  | "missing_division"
  | "missing_delivery_date"
  | "empty_lines"
  | "vat_unknown"
  | "qty_not_positive_integer"
  | "missing_unit_price"
  | "price_off_c4";

export interface ErpReadiness {
  ok: boolean;
  reasons: ErpReason[];
  /** รหัสสินค้าที่ทำให้ติดเหตุผลนั้น — เอาไปโชว์บนจอให้คนตามแก้ได้ */
  offendingSkus: Partial<Record<ErpReason, string[]>>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ปัดเป็นจำนวนเต็มหีบ — ปลายทางรับ `quantityCase` เป็นจำนวนเต็มเท่านั้น */
function toCases(qty: number): number {
  return Math.round(qty);
}

/**
 * แปลงเอกสาร PO เป็น payload — **ไม่ตรวจความพร้อม** ให้เรียก checkErpReadiness แยก
 *
 * เจตนาที่แยกกัน: หน้าจอต้องโชว์ payload ให้ดูได้แม้ใบนั้นยังไม่พร้อมส่ง (เช่นยังไม่รู้
 * deliveryDate) ไม่งั้นคนจะไม่มีทางเห็นว่าอะไรจะถูกส่งไปจริง ๆ
 */
export function buildErpPayload(
  doc: PoDocument,
  ctx: ErpPayloadContext
): ErpOrderPayload {
  const orderDetail: ErpOrderDetail[] = doc.lines.map((l) => {
    const unitPrice = l.unitPrice ?? 0;
    const net = l.netUnitPrice ?? unitPrice;
    const quantityCase = toCases(l.qty);
    return {
      productCode: l.skuCode,
      // ออเดอร์ปกติชี้กลับที่ตัวเอง — ช่องนี้มีไว้ผูกของแถมกับสินค้าที่ทำให้ได้แถม
      // ซึ่งเป็นเรื่องของ isSpecial ที่เราไม่ใช้
      promotionTo: l.skuCode,
      quantityCase,
      quantityUnit: "B",
      discountPercent: l.discountPct ?? 0,
      // VMI เก็บส่วนลดเป็นบาท "ต่อหีบ" อยู่แล้ว ไม่ต้องหารด้วยจำนวนเหมือนฝั่ง ocr
      discountUnit: l.discountBaht ?? 0,
      unitPrice,
      amount: round2(net * quantityCase),
      vatAmount: l.vatStatus === "Y" ? round2(net * quantityCase * ERP_VAT_RATE) : 0,
      buyOrFree: "B",
    };
  });

  return {
    orderNo: doc.poNumber,
    customerCode: ctx.customerCode,
    salesmanCode: ctx.salesmanCode,
    divisionCode: ctx.divisionCode,
    createDate: ctx.createDate,
    deliveryDate: ctx.deliveryDate,
    // นับจากบรรทัดที่ส่งจริงเสมอ ไม่ใช่ doc.itemCount — ปลายทางตอบ 400 ถ้าไม่ตรงกัน
    // และนี่คือจุดที่ฝั่ง ocr เคยพลาดมาแล้ว (countitem ที่ stage ไว้ ≠ จำนวนที่ส่ง)
    countItem: orderDetail.length,
    orderDetail,
  };
}

/**
 * ตรวจว่าใบนี้ส่งได้หรือยัง — คืน **code** ไม่ใช่ข้อความลอย ๆ
 * (แนวเดียวกับ ocr-po-matching/backend/erp_readiness.py ที่คืน reason codes)
 */
export function checkErpReadiness(
  doc: PoDocument,
  ctx: ErpPayloadContext
): ErpReadiness {
  const reasons: ErpReason[] = [];
  const offending: Partial<Record<ErpReason, string[]>> = {};
  const add = (reason: ErpReason, sku?: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (sku) {
      offending[reason] = [...(offending[reason] ?? []), sku];
    }
  };

  if (!doc.poNumber.trim()) {
    add("missing_po_number");
  } else {
    // checkPoNumberFormat โยน Error พร้อมข้อความไทย (ทำไว้ให้ฟอร์มที่พนักงานพิมพ์เลขเอง)
    // ที่นี่ต้องการแค่ผ่าน/ไม่ผ่าน จึงดักไว้ ไม่ให้ทั้งหน้าล้มเพราะเลขใบเดียวผิดรูป
    try {
      checkPoNumberFormat(doc.poNumber);
    } catch {
      add("po_number_invalid");
    }
  }

  if (!ctx.customerCode.trim()) add("missing_customer_code");
  if (!ctx.salesmanCode.trim()) add("missing_salesman_code");
  if (!ctx.divisionCode.trim()) add("missing_division");
  if (!ctx.deliveryDate) add("missing_delivery_date");

  if (doc.lines.length === 0) add("empty_lines");

  for (const l of doc.lines) {
    // VAT ไม่รู้ = กันทั้งใบ ห้ามส่งบางส่วน (กติกาเดียวกับ ocr-po-matching)
    if (l.vatStatus === null) add("vat_unknown", l.skuCode);
    if (!Number.isFinite(l.qty) || toCases(l.qty) <= 0)
      add("qty_not_positive_integer", l.skuCode);
    if (l.unitPrice == null) add("missing_unit_price", l.skuCode);
  }

  // ราคาที่ไม่ตรง C4: ระบบวางบิลจะคิดโปรใหม่จาก C4 แล้วราคาที่ร้านกับเซลส์ตกลงกันไว้
  // จะไม่ถูกใช้ — ยังไม่รู้ว่าปลายทางจัดการเคสนี้ยังไง (คำถามข้อ 3 ถึงทีม ERP)
  if (doc.priceKind !== "c4") add("price_off_c4");

  return { ok: reasons.length === 0, reasons, offendingSkus: offending };
}

const REASON_LABEL: Record<ErpReason, string> = {
  missing_po_number: "ไม่มีเลข PO",
  po_number_invalid: `เลข PO ไม่เข้ารูปแบบที่ปลายทางรับ (A-Z 0-9 ไม่เกิน ${ERP_ORDER_NO_MAX} ตัว)`,
  missing_customer_code:
    "ไม่รู้รหัสลูกค้าของคลังนี้ — ตั้งได้ที่หน้า จัดการคลัง VDA (/admin/vda)",
  missing_salesman_code:
    "ไม่รู้รหัสเซลส์ของคลังนี้ — ตั้งได้ที่หน้าจัดการเซลส์ของคลัง",
  missing_division: "ไม่รู้รหัส division ของลูกค้ารายนี้",
  missing_delivery_date:
    "ยังไม่ได้กำหนดวันส่งของ — รอทีม ERP ยืนยันว่าต้องใช้วันไหน จึงยังส่งไม่ได้",
  empty_lines: "ใบนี้ไม่มีรายการสินค้า",
  vat_unknown:
    "ไม่รู้ว่าสินค้ามี VAT หรือไม่ (master ไม่ได้ระบุ VatStatus) — ส่งบางส่วนไม่ได้ ต้องกันทั้งใบ",
  qty_not_positive_integer: "จำนวนสั่งไม่ใช่จำนวนหีบที่มากกว่า 0",
  missing_unit_price: "ไม่มีราคาต่อหีบ",
  price_off_c4:
    "ราคาบนใบนี้ไม่ตรง C4 — ระบบวางบิลปลายทางจะคิดโปรใหม่จาก C4 ซึ่งอาจไม่ตรงกับที่ตกลงไว้ (รอคำตอบจากทีม ERP)",
};

export function erpReasonLabel(reason: ErpReason): string {
  return REASON_LABEL[reason];
}
