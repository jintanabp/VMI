import { checkPoNumberFormat, PO_NUMBER_MAX_LEN } from "./po-number";
import type { PoDocument } from "./po-document";
import { collectOwedFreeGoods } from "@/lib/promo/order-free-goods";

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
 * ## ราคาไม่ตรง C4 → special deal — แก้ 14 ก.ย. 69 (กลับคำตัดสินใจเดิม)
 * รอบแรกเข้าใจผิดว่า "ใช้ราคาที่เราส่งได้เลย" แปลว่าไม่ต้องใช้ `isSpecial`/`isErrorC4` เลย
 * แต่ตรวจโค้ด ocr-po-matching จริงแล้วพบว่า **`isErrorC4` ถูกกำหนดจาก "ราคาไม่ตรง C4"
 * โดยตรง** (`backend/c4_alignment.error_po_numbers()`: "PO numbers carrying at least
 * one C4-misaligned line") ไม่ใช่จากอย่างอื่นเลย — ตรงกับ `doc.priceKind !== "c4"`
 * ของ VMI แบบ 1:1 ⇒ กติกาจริงคือ:
 * - **ราคาตรง C4** (`priceKind === "c4"`) → ออเดอร์ปกติ ไม่ส่ง `isSpecial`/`isErrorC4` เลย
 *   (omit ทั้งคู่ ไม่ใช่ส่ง "" — ตามตัวอย่าง "normal order" ในสเปก prod)
 * - **ราคาไม่ตรง C4** (`priceKind !== "c4"`) → ส่ง `isSpecial: "Y"` + `isErrorC4: "Y"`
 *   คู่กันเสมอ (สเปกบังคับ ไม่งั้น 400) **เพื่อให้เข้ากระบวนการอนุมัติของ marketing**
 *   ที่ยืนยันแล้วว่า "ต้องมี" — ถ้าส่งเป็นออเดอร์ปกติเฉย ๆ จะไม่มีอะไรไปกระตุ้นให้มีคนอนุมัติเลย
 *
 * ## บรรทัด `F` (ของแถม) — สร้างแล้วเมื่อ `isSpecial=Y`
 * สเปก: ออเดอร์ปกติห้ามมีบรรทัด `F` (ระบบวางบิลคิดโปรใหม่จาก C4 เอง) แต่ special deal
 * **ต้องส่งเอง** (`docs/ocr-insertOCROrderToBill-prod.md` ตัวอย่าง "special deal"/"C4 error")
 * ⇒ `buildErpPayload` เรียก `collectOwedFreeGoods(doc.lines)` (ตัวเดียวกับที่ Excel export
 * ใช้สรุปของแถม dedupe โปรกลุ่มแล้ว) แล้วแปลงแต่ละก้อนเป็นบรรทัด `F`:
 * `unitPrice`/`amount`/`discountPercent`/`discountUnit`/`vatAmount` = 0 ทั้งหมด (ตรงกับ
 * `sgo_billing.py:81-93` และตัวอย่างในสเปก) `promotionTo` ชี้ SKU ตัวแรกที่ทำให้ได้ของแถมนั้น
 * (ตัวอย่างในสเปกก็ชี้กลับที่ SKU ที่ซื้อ ไม่ใช่ตัวเอง)
 *
 * **ข้อมูลจริงในเครื่องนี้ยังมีของแถม 0 จาก 2,436 บรรทัด** (ตรวจ 14 ก.ย. 69) — โค้ดที่คำนวณ/
 * บันทึกของแถม (`app/api/orders/route.ts` เรียก `lookupOrderPromoLines`) ทำงานถูกต้องอยู่แล้ว
 * แค่ยังไม่มีออเดอร์ทดสอบไหนสั่งของที่ติดโปรของแถมพอดี — ทางแปลงบรรทัด `F` นี้จึงยังไม่เคยเทส
 * กับข้อมูลจริง มีแต่เทสสังเคราะห์ (`tests/erp-payload.test.ts`)
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
 *  สำหรับลูกค้าของ vda1–vda5 ทุกราย · **ยืนยันแล้ว 11 ก.ย. 69 ว่า `E` ถูกต้อง**
 *  (อยู่ในโค้ดไม่ใช่ env เพราะผู้ใช้ไม่ต้องการแก้ env บนเซิร์ฟเวอร์) ·
 *  ปลายทางเป็น `DIVISIONSALE CHAR(1)` ⇒ ยาวได้ตัวเดียวพอดี */
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
  /** มีเฉพาะเมื่อราคาไม่ตรง C4 — ไม่มี key นี้เลยสำหรับออเดอร์ปกติ (omit ตามสเปก ไม่ใช่ "") */
  isSpecial?: "Y";
  /** มาคู่กับ isSpecial เสมอ — ดูหัวไฟล์ */
  isErrorC4?: "Y";
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
  /** สิ่งที่ควรรู้แต่ไม่กันส่ง — ตอนนี้มีแค่ price_off_c4 (ดูหัวไฟล์) */
  notices: ErpReason[];
  /** รหัสสินค้าที่ทำให้ติดเหตุผลนั้น — เอาไปโชว์บนจอให้คนตามแก้ได้ (รวม notices ด้วย) */
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
  const isSpecial = doc.priceKind !== "c4";

  const buyLines: ErpOrderDetail[] = doc.lines.map((l) => {
    const unitPrice = l.unitPrice ?? 0;
    const net = l.netUnitPrice ?? unitPrice;
    const quantityCase = toCases(l.qty);
    return {
      productCode: l.skuCode,
      // ชี้กลับที่ตัวเองเสมอ ไม่ว่าปกติหรือ special deal — ตัวอย่างในสเปกทั้งสองแบบ
      // บรรทัดซื้อก็ promotionTo ตัวเอง มีแต่บรรทัด F เท่านั้นที่ชี้ไปสินค้าอื่น
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

  // เฉพาะ special deal เท่านั้นที่ส่งบรรทัด F ได้ — ออเดอร์ปกติห้ามเด็ดขาด (400)
  const freeLines: ErpOrderDetail[] = isSpecial
    ? collectOwedFreeGoods(doc.lines).map((fg) => ({
        productCode: fg.code,
        // ชี้ไปสินค้าตัวแรกที่ทำให้ได้ของแถมนี้ (โปรกลุ่มมีได้หลายตัว — เลือกตัวแรกพอ
        // ตามที่ ocr เองก็ทำแบบนี้เมื่อไม่รู้ว่าจะจับคู่กับตัวไหนเป๊ะ ๆ)
        promotionTo: fg.fromSkuCodes[0] ?? fg.code,
        quantityCase: toCases(fg.qty),
        quantityUnit: "B",
        discountPercent: 0,
        discountUnit: 0,
        unitPrice: 0,
        amount: 0,
        vatAmount: 0,
        buyOrFree: "F",
      }))
    : [];

  const orderDetail = [...buyLines, ...freeLines];

  return {
    orderNo: doc.poNumber,
    customerCode: ctx.customerCode,
    salesmanCode: ctx.salesmanCode,
    divisionCode: ctx.divisionCode,
    createDate: ctx.createDate,
    deliveryDate: ctx.deliveryDate,
    // omit ทั้งคู่เมื่อไม่ special — ตรงกับตัวอย่าง "normal order" ในสเปกที่ไม่มี key นี้เลย
    ...(isSpecial ? { isSpecial: "Y" as const, isErrorC4: "Y" as const } : {}),
    // นับจากบรรทัดที่ส่งจริงเสมอ (รวมบรรทัด F) ไม่ใช่ doc.itemCount — ปลายทางตอบ 400 ถ้าไม่ตรงกัน
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
  const notices: ErpReason[] = [];
  const offending: Partial<Record<ErpReason, string[]>> = {};
  const add = (reason: ErpReason, sku?: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (sku) {
      offending[reason] = [...(offending[reason] ?? []), sku];
    }
  };
  const notice = (reason: ErpReason) => {
    if (!notices.includes(reason)) notices.push(reason);
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

  // ราคาที่ไม่ตรง C4 = special deal (isSpecial/isErrorC4 = Y ใน buildErpPayload) — ไม่กันส่ง
  // เพราะเป็นเส้นทางที่ถูกต้องแล้ว แค่เตือนไว้ให้รู้ว่าใบนี้จะเข้ากระบวนการอนุมัติของ marketing
  if (doc.priceKind !== "c4") notice("price_off_c4");

  return { ok: reasons.length === 0, reasons, notices, offendingSkus: offending };
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
    "ราคาบนใบนี้ไม่ตรง C4 — ส่งเป็น special deal (isSpecial=Y) พร้อมของแถมที่ต้องส่งเอง จะเข้ากระบวนการอนุมัติของ marketing ฝั่ง ERP เพิ่มอีกขั้น",
};

export function erpReasonLabel(reason: ErpReason): string {
  return REASON_LABEL[reason];
}
