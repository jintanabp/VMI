import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { OrderLinePriceSource } from "@/lib/calculations";
import type { PoPriceKind } from "./split-plan";

/**
 * เอกสาร PO — **หนึ่งไฟล์ต่อหนึ่ง PO** ไม่ใช่ต่อออเดอร์
 *
 * ของเดิม (lib/po/export-stub.ts) เขียน JSON ที่มีแค่ skuCode/qty/unit
 * ⇒ กลไกแก้ราคาทั้งหมดตายที่หน้าตรวจ ไม่ไหลไปถึงปลายทางเลย
 * (ช่องว่างเดียวกันมีใน ocr-po-matching: staging row ใช้เลข PO แม่เป็น orderno
 *  เลขลูกไม่ไหลลง ERP — เราใช้เลขลูกจริง)
 */

/** VAT 7% — ค่าเดียวกับ erp_export.py ของ ocr-po-matching */
export const VAT_RATE = 0.07;

export interface PoDocumentLine {
  skuCode: string;
  skuName: string;
  qty: number;
  unit: "case";
  unitPrice: number | null;
  priceSource: OrderLinePriceSource;
  discountBaht: number | null;
  discountPct: number | null;
  netUnitPrice: number | null;
  amount: number;
  vatAmount: number;
  promoGroup: string | null;
  /** จำนวนสมาชิกในกลุ่มโปร — ใช้ตัดสินว่าของแถมเป็นของกลุ่ม (ห้ามบวกซ้ำ) */
  promoGroupMembers: number | null;
  /** ข้อความขั้นโปรที่ได้ ณ เวลาร้านสั่ง */
  promoLabel: string | null;
  /** ของแถมที่ควรได้ — โปรกลุ่มจะซ้ำกันทุกบรรทัด ใช้ collectOwedFreeGoods() รวมยอด */
  freeGood: {
    code: string;
    name: string;
    qty: number;
    unit: string;
  } | null;
  /**
   * สินค้าตัวนี้มี VAT ไหม ณ เวลาออก PO (`null` = master ไม่บอก)
   *
   * แช่ไว้กับเอกสารเหมือนราคา เพราะ `vatAmount` ข้างล่างคิดจากค่านี้ — ถ้า master
   * เปลี่ยนทีหลัง เอกสารที่ออกไปแล้วต้องอธิบายตัวเองได้ว่าคิดบนอะไร
   */
  vatStatus: "Y" | "N" | null;
  /** ราคาไม่ตรง C4 ณ เวลาออก PO */
  priceFlagged: boolean;
  priceFlagReason: string | null;
  /** หมายเหตุถึงฝ่ายจัดซื้อ — ว่างเมื่อไม่มีอะไรต้องเตือน */
  note?: string;
}

export interface PoDocument {
  poNumber: string;
  groupKey: string;
  priceKind: PoPriceKind;
  orderId: string;
  storeCode: string;
  storeName: string;
  approvedAt: string;
  approvedBy: string;
  itemCount: number;
  totalQty: number;
  totalAmount: number;
  vatTotal: number;
  grandTotal: number;
  lines: PoDocumentLine[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildPoDocument(args: {
  poNumber: string;
  groupKey: string;
  priceKind: PoPriceKind;
  orderId: string;
  storeCode: string;
  storeName: string;
  approvedAt: Date;
  approvedBy: string;
  lines: Omit<PoDocumentLine, "amount" | "vatAmount">[];
}): PoDocument {
  /**
   * VAT คิดตาม VatStatus ของสินค้า ไม่ใช่ 7% ทุกบรรทัด
   *
   * เดิมคูณ 7% ทุกบรรทัดไม่มีเงื่อนไข ทั้งที่ master มีคอลัมน์ VatStatus อยู่แล้ว
   * (นับจากไฟล์จริง: Y 110,457 · N 125 · ว่าง 3) ⇒ สินค้า 125 รหัสที่ไม่มี VAT
   * ถูกคิด VAT บนใบ PO มาตลอด
   *
   * `null` (master ไม่บอก) คิดเป็น 0 บนเอกสาร **แต่ต้องไม่ถูกส่งเข้า ERP** —
   * ตัวตรวจความพร้อมใน lib/po/erp-payload.ts กันไว้ด้วยเหตุผล `vat_unknown`
   * (กติกาเดียวกับ ocr-po-matching ที่ hold ทั้งใบเมื่อ VAT ไม่รู้ ห้ามส่งบางส่วน)
   */
  const lines: PoDocumentLine[] = args.lines.map((l) => {
    const net = l.netUnitPrice ?? l.unitPrice ?? 0;
    const amount = round2(net * l.qty);
    const vatAmount = l.vatStatus === "Y" ? round2(amount * VAT_RATE) : 0;
    return { ...l, amount, vatAmount };
  });

  const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.vatAmount, 0));

  return {
    poNumber: args.poNumber,
    groupKey: args.groupKey,
    priceKind: args.priceKind,
    orderId: args.orderId,
    storeCode: args.storeCode,
    storeName: args.storeName,
    approvedAt: args.approvedAt.toISOString(),
    approvedBy: args.approvedBy,
    itemCount: lines.length,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalAmount,
    vatTotal,
    grandTotal: round2(totalAmount + vatTotal),
    lines,
  };
}

/** เขียน PO ลงดิสก์ — ตั้งชื่อไฟล์ด้วยเลข PO เพื่อให้ตามหาได้จากเอกสารจริง */
export async function writePoDocument(doc: PoDocument): Promise<string> {
  const dir = path.join(process.cwd(), "logs", "po-export");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${doc.poNumber}.json`);
  await writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
  return filePath;
}
