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
  /** ราคาไม่ตรง C4 ณ เวลาออก PO */
  priceFlagged: boolean;
  priceFlagReason: string | null;
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
  const lines: PoDocumentLine[] = args.lines.map((l) => {
    const net = l.netUnitPrice ?? l.unitPrice ?? 0;
    const amount = round2(net * l.qty);
    return { ...l, amount, vatAmount: round2(amount * VAT_RATE) };
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
