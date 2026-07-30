import type ExcelJS from "exceljs";
import type { StockRowComputed } from "@/lib/repositories/types";
import type { PromoTierInput } from "@/lib/calculations";
import { bangkokDateStr } from "@/lib/fabric/bkk-date";

/**
 * ชีต "ฟอร์มสั่ง" — พิมพ์ออกมากรอกจำนวนด้วยมือได้ในตัวเอง
 *
 * เวอร์ชันก่อนหน้ามีปัญหาที่แก้ในไฟล์นี้:
 * - คอลัมน์ "วันส่ง" 8 คอลัมน์ (J–Q) แต่เขียนจริงแค่คอลัมน์เดียว อีก 7 คอลัมน์
 *   พิมพ์ออกมาไม่มีหัวตาราง (เซลล์แถว 3 เป็นสูตร ไม่ใช่ข้อความ) และการวางแผน
 *   หลายวันไม่ได้ถูก model ไว้ที่ไหนในระบบ ⇒ ยุบเป็น "จำนวนสั่ง" คอลัมน์เดียว
 * - สูตรช่วยซ่อน 8 คอลัมน์ **ต่อแถว** (V–AC) มีไว้ป้อนแถว 2 ที่ถูกลบไปแล้ว
 *   → 800 แถว = 6,400 สูตรทิ้งเปล่า
 * - รหัสสินค้าฝังอยู่ในชื่อ (`[123] ชื่อ`) และไม่มีบาร์โค้ดเลย ทั้งที่คนกรอกถือเครื่องสแกน
 * - `numFmt = "#,##0"` ทับคอลัมน์ราคาทั้งช่วง ทำให้เงินถูกปัดเป็นจำนวนเต็ม
 * - ไม่มี pageSetup เลย ⇒ ฟอร์ม 800 แถว หน้า 2 ขึ้นไปพิมพ์ออกมาไม่มีหัวคอลัมน์
 * - ไม่มีข้อมูลอ้างอิง (คงเหลือ/CVD/MIN-MAX/ขายเฉลี่ย) ให้คนตัดสินใจว่าจะสั่งเท่าไร
 */

const FONT = process.env.EXPORT_FONT || "Browallia New";
const FONT_SIZE = 14;
const NUM_INT = "#,##0";
const NUM_DP1 = "#,##0.0";
const NUM_MONEY = "#,##0.00";
const NUM_ACCT_DP = '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)';

/** VAT 7% — ค่าเดียวกับที่ระบบ ERP ปลายทางใช้ */
const VAT_RATE = 0.07;

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "hair", color: { argb: "FF000000" } },
  left: { style: "hair", color: { argb: "FF000000" } },
  bottom: { style: "hair", color: { argb: "FF000000" } },
  right: { style: "hair", color: { argb: "FF000000" } },
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function baseFont(opts?: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> {
  return { name: FONT, size: FONT_SIZE, ...opts };
}

/** เดือนภาษาไทย + พ.ศ. เช่น กรกฎาคม 2569 */
export function thaiMonthYear(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

/** ข้อความสถานะหยุดสั่ง — ใช้ร่วมกับชีต "สต็อก" เพื่อไม่ให้สองที่หลุดจากกัน */
export function blockLabel(row: StockRowComputed): string {
  if (!row.blocked) return "";
  const parts = ["หยุดสั่ง"];
  if (row.blockReason?.trim()) parts.push(row.blockReason.trim());
  if (row.blockEffectiveTo) {
    parts.push(`ถึง ${row.blockEffectiveTo.slice(0, 10)}`);
  } else {
    parts.push("ถาวร");
  }
  return parts.join(" · ");
}

/**
 * ข้อความโปรในคอลัมน์ "โปรโมชั่นที่ได้"
 * ช่วงจำนวน (`1-9`, `10 หีบขึ้นไป`) เป็นหน้าที่ของ **ผู้เรียก** ทั้งเคสขั้นเดียวและหลายขั้น
 * — เดิม branch ของแถมพิมพ์ `tier.minQty` ซ้ำอีกครั้ง ได้ข้อความแบบ "1-9 1 หีบฟรี 2 X"
 */
export function formatOrderFormPromo(row: StockRowComputed): string {
  const tiers = (row.promoTiers ?? []).filter((t) => {
    const kind = t.kind ?? "none";
    return (
      kind === "discount_baht" || kind === "discount_pct" || kind === "premium"
    );
  });

  if (tiers.length === 0) {
    return row.currentPromo?.trim() || "";
  }

  if (tiers.length === 1) {
    const t = tiers[0]!;
    const benefit = formatSingleTierPromo(t);
    return benefit ? `≥${t.minQty} หีบ ${benefit}` : "";
  }

  return tiers
    .map((t, i) => {
      const next = tiers[i + 1];
      const range = next
        ? `${t.minQty}-${next.minQty - 1}`
        : `${t.minQty} หีบขึ้นไป`;
      return `${range} ${formatSingleTierPromo(t)}`;
    })
    .join(", ");
}

function formatSingleTierPromo(tier: PromoTierInput): string {
  const kind = tier.kind ?? "none";
  if (kind === "discount_baht" && tier.discBaht != null) {
    const n = tier.discBaht;
    const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return `ลดหีบละ ${text}`;
  }
  if (kind === "discount_pct" && tier.discPct != null) {
    return `ลด ${tier.discPct}%`;
  }
  if (kind === "premium" && tier.premiumProduct) {
    const name = tier.premiumName || tier.premiumProduct;
    const qty = tier.premiumQty ?? 1;
    return `ฟรี ${qty} ${name}`;
  }
  if (tier.discount) {
    if (/ลด/.test(tier.discount)) return tier.discount;
    return `ลดหีบละ ${tier.discount}`;
  }
  return "";
}

function discountBaht(row: StockRowComputed): number | null {
  if (row.discountBahtPerCase != null && row.discountBahtPerCase > 0) {
    return row.discountBahtPerCase;
  }
  if (
    row.unitPrice != null &&
    row.discountPctPerCase != null &&
    row.discountPctPerCase > 0
  ) {
    return Math.round((row.unitPrice * row.discountPctPerCase) / 100);
  }
  return null;
}

export interface OrderFormExportOptions {
  storeName: string;
  rows: StockRowComputed[];
  /** วันออกรายงาน — default = ตอนนี้ */
  asOf?: Date;
  /** จำนวนแถวว่างสำหรับเพิ่มสินค้าใหม่ท้ายฟอร์ม */
  blankNewRows?: number;
  /**
   * จำนวนที่ผู้ใช้ตั้งไว้บนหน้าจอ (skuCode → หีบ)
   * ถ้าไม่ส่งมาจะใช้ `suggestOrder` ของระบบ
   */
  qtyByCode?: Record<string, number>;
}

/** ลำดับคอลัมน์: 18 คอลัมน์ที่เห็น + 1 คอลัมน์ meta ที่ซ่อน */
const COL = {
  code: 1,
  barcode: 2,
  name: 3,
  brand: 4,
  pack: 5,
  stock: 6,
  cvd: 7,
  minmax: 8,
  avgSales: 9,
  suggest: 10,
  price: 11,
  disc: 12,
  net: 13,
  vat: 14,
  qty: 15,
  amount: 16,
  promo: 17,
  note: 18,
  meta: 19,
} as const;

const LAST_COL = COL.note;

export function buildOrderFormSheet(
  wb: ExcelJS.Workbook,
  opts: OrderFormExportOptions
): ExcelJS.Worksheet {
  const asOf = opts.asOf ?? new Date();
  // อย่างน้อย 1 แถว เพื่อให้เคส "ผลลัพธ์ว่าง" ยังได้ฟอร์มที่กรอกได้
  // และช่วง SUM ไม่ย้อนกลับไปชี้เซลล์ตัวเอง
  const blankNew = Math.max(1, opts.blankNewRows ?? 3);
  const dataStart = 4;
  const productCount = opts.rows.length;
  const dataEnd = productCount > 0 ? dataStart + productCount - 1 : dataStart - 1;
  const blankStart = dataEnd + 1;
  const blankEnd = blankStart + blankNew - 1;
  const totalRow = blankEnd + 1;
  const sumLast = totalRow - 1;

  const sheet = wb.addWorksheet("ฟอร์มสั่ง", {
    views: [
      {
        state: "frozen",
        // ตรึงรหัส/บาร์โค้ด/ชื่อ/แบรนด์ ให้เลื่อนดูตัวเลขได้โดยยังรู้ว่าแถวไหน
        xSplit: COL.brand,
        ySplit: 3,
        topLeftCell: "E4",
        activeCell: "O4",
      },
    ],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      showGridLines: false,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
    headerFooter: {
      oddFooter: `&L&10${opts.storeName || ""} · ${bangkokDateStr(asOf)}&R&10หน้า &P/&N`,
    },
  });

  // numFmt ตั้งที่ระดับคอลัมน์ ไม่วน set ต่อ cell — เดิมวน set แล้วทับคอลัมน์เงิน
  // ด้วย "#,##0" ทำให้ราคา/ส่วนลด/VAT ถูกปัดเป็นจำนวนเต็มทั้งหมด
  sheet.columns = [
    { key: "code", width: 12, style: { numFmt: "@" } },
    { key: "barcode", width: 16, style: { numFmt: "@" } },
    { key: "name", width: 46 },
    { key: "brand", width: 16 },
    { key: "pack", width: 9, style: { numFmt: NUM_INT } },
    { key: "stock", width: 11, style: { numFmt: NUM_INT } },
    { key: "cvd", width: 9, style: { numFmt: NUM_DP1 } },
    { key: "minmax", width: 11, style: { numFmt: "@" } },
    { key: "avgSales", width: 12, style: { numFmt: NUM_DP1 } },
    { key: "suggest", width: 12, style: { numFmt: NUM_INT } },
    { key: "price", width: 11, style: { numFmt: NUM_MONEY } },
    { key: "disc", width: 11, style: { numFmt: NUM_MONEY } },
    { key: "net", width: 12, style: { numFmt: NUM_MONEY } },
    { key: "vat", width: 12, style: { numFmt: NUM_MONEY } },
    { key: "qty", width: 12, style: { numFmt: NUM_INT } },
    { key: "amount", width: 13, style: { numFmt: NUM_MONEY } },
    { key: "promo", width: 38 },
    { key: "note", width: 30 },
    { key: "meta", width: 10, style: { numFmt: "@" } },
  ];

  // ---- แถว 1-2: หัวฟอร์ม + ยอดรวม ----
  sheet.getRow(1).height = 24;
  sheet.getCell(1, COL.barcode).value = "แบบฟอร์มสั่งสินค้า";
  sheet.getCell(1, COL.barcode).font = baseFont({ bold: true, size: 18 });

  sheet.getCell(1, COL.vat).value = "ยอดสั่งซื้อรวม (หีบ)";
  sheet.getCell(1, COL.vat).font = baseFont({ bold: true });
  sheet.getCell(1, COL.vat).alignment = { horizontal: "right" };
  sheet.getCell(1, COL.qty).value = { formula: `O${totalRow}` };
  sheet.getCell(1, COL.qty).font = baseFont({ bold: true });
  sheet.getCell(1, COL.qty).numFmt = NUM_INT;

  sheet.mergeCells(1, COL.promo, 1, COL.note);
  sheet.getCell(1, COL.promo).value = thaiMonthYear(asOf);
  sheet.getCell(1, COL.promo).font = baseFont({ bold: true });
  sheet.getCell(1, COL.promo).alignment = { horizontal: "center" };

  sheet.getRow(2).height = 20;
  sheet.getCell(2, COL.barcode).value = opts.storeName || "";
  sheet.getCell(2, COL.barcode).font = baseFont({ bold: true });

  sheet.getCell(2, COL.vat).value = "มูลค่ารวม";
  sheet.getCell(2, COL.vat).font = baseFont({ bold: true });
  sheet.getCell(2, COL.vat).alignment = { horizontal: "right" };
  sheet.getCell(2, COL.amount).value = { formula: `P${totalRow}` };
  sheet.getCell(2, COL.amount).font = baseFont({ bold: true });
  sheet.getCell(2, COL.amount).numFmt = NUM_ACCT_DP;

  // ---- แถว 3: หัวตาราง (ข้อความจริงทุกคอลัมน์) ----
  const headers: Array<[number, string]> = [
    [COL.code, "รหัสสินค้า"],
    [COL.barcode, "บาร์โค้ด"],
    [COL.name, "ชื่อสินค้า"],
    [COL.brand, "แบรนด์"],
    [COL.pack, "บรรจุ (ชิ้น/หีบ)"],
    [COL.stock, "คงเหลือ (หีบ)"],
    [COL.cvd, "CVD (วัน)"],
    [COL.minmax, "MIN/MAX (วัน)"],
    [COL.avgSales, "ขายเฉลี่ย/วัน (หีบ)"],
    [COL.suggest, "แนะนำสั่ง (หีบ)"],
    [COL.price, "ราคา/หีบ"],
    [COL.disc, "ส่วนลด/หีบ"],
    [COL.net, "ราคาสุทธิ/หีบ"],
    // ห้ามคำนวณ VAT_RATE*100 ในหัวตาราง — ได้ "7.000000000000001%" จาก float
    [COL.vat, "รวม VAT 7%"],
    [COL.qty, "จำนวนสั่ง (หีบ)"],
    [COL.amount, "มูลค่า"],
    [COL.promo, "โปรโมชั่นที่ได้"],
    [COL.note, "หมายเหตุ"],
  ];
  for (const [col, text] of headers) {
    const cell = sheet.getCell(3, col);
    cell.value = text;
    cell.font = baseFont({
      bold: true,
      ...(col === COL.disc ? { color: { argb: "FFFF0000" } } : {}),
    });
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = thinBorder;
    cell.fill = solidFill("FFE2E8F0");
  }
  // ช่องที่ต้องกรอกด้วยมือ — ทำให้เห็นชัดว่าตรงไหนคือช่องเขียน
  sheet.getCell(3, COL.qty).fill = solidFill("FFC6EFCE");
  sheet.getRow(3).height = 30;

  const styleRow = (r: number) => {
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder;
      if (!cell.font?.name) cell.font = baseFont();
      if (c === COL.name || c === COL.promo || c === COL.note) {
        cell.alignment = { vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
    // ไฮไลต์ช่องกรอกจำนวนทุกแถว
    sheet.getCell(r, COL.qty).fill = solidFill("FFF2FBF4");
  };

  // ---- แถวสินค้า ----
  opts.rows.forEach((row, idx) => {
    const r = dataStart + idx;
    sheet.getRow(r).height = 20;

    const disc = discountBaht(row);
    const suggest = row.suggestOrder > 0 ? row.suggestOrder : null;
    // จำนวนที่ผู้ใช้ตั้งบนหน้าจอชนะค่าที่ระบบแนะนำ — เขียนเป็นตัวเลขจริง ไม่ใช่สูตร
    const orderQty = opts.qtyByCode?.[row.skuCode] ?? suggest;

    sheet.getCell(r, COL.code).value = row.skuCode;
    sheet.getCell(r, COL.barcode).value = row.barcode ?? "";
    sheet.getCell(r, COL.name).value = row.skuName;
    sheet.getCell(r, COL.brand).value = row.brand ?? "";
    sheet.getCell(r, COL.pack).value = row.packSize;
    sheet.getCell(r, COL.stock).value = row.stockCases;
    if (row.stockCvd != null) sheet.getCell(r, COL.cvd).value = row.stockCvd;
    sheet.getCell(r, COL.minmax).value = `${row.minDays}/${row.maxDays}`;
    sheet.getCell(r, COL.avgSales).value = row.avgQtyOutL7 ?? row.avgSales;
    if (suggest != null) sheet.getCell(r, COL.suggest).value = suggest;
    if (row.unitPrice != null) {
      sheet.getCell(r, COL.price).value = row.unitPrice;
    }
    if (disc != null) {
      const dCell = sheet.getCell(r, COL.disc);
      dCell.value = disc;
      dCell.font = baseFont({ color: { argb: "FFFF0000" } });
    }
    sheet.getCell(r, COL.net).value = { formula: `K${r}-L${r}` };
    sheet.getCell(r, COL.vat).value = { formula: `M${r}*${1 + VAT_RATE}` };
    if (orderQty != null && orderQty > 0) {
      sheet.getCell(r, COL.qty).value = orderQty;
    }
    sheet.getCell(r, COL.amount).value = { formula: `O${r}*M${r}` };
    sheet.getCell(r, COL.promo).value = formatOrderFormPromo(row);

    const notes: string[] = [];
    const block = blockLabel(row);
    if (block) notes.push(block);
    if (row.nextPromo) {
      notes.push(
        row.qtyToNext != null
          ? `อีก ${row.qtyToNext} หีบ → ${row.nextPromo}`
          : row.nextPromo
      );
    }
    if (row.isNew) notes.push("สินค้าใหม่");
    if (row.noSales30) notes.push("ไม่ขาย 1 เดือน");
    sheet.getCell(r, COL.note).value = notes.join(" · ");

    styleRow(r);

    // ---- สัญญาณสายตา: คำนวณฝั่งเซิร์ฟเวอร์ ไม่พึ่ง conditional formatting ----
    if (row.isNew) {
      for (const c of [COL.code, COL.barcode, COL.name]) {
        sheet.getCell(r, c).fill = solidFill("FFFFC000");
      }
    }
    if (row.blocked) {
      for (let c = 1; c <= LAST_COL; c++) {
        sheet.getCell(r, c).fill = solidFill("FFE7E7E7");
      }
    } else if (row.stockCvd != null) {
      if (row.stockCvd < row.minDays) {
        sheet.getCell(r, COL.cvd).fill = solidFill("FFFFC7CE");
      } else if (row.stockCvd > row.maxDays) {
        sheet.getCell(r, COL.cvd).fill = solidFill("FFFFEB9C");
      }
    }
  });

  // ---- แถวว่างสำหรับเพิ่มสินค้าที่ไม่มีในระบบ ----
  for (let i = 0; i < blankNew; i++) {
    const r = blankStart + i;
    sheet.getRow(r).height = 20;
    if (i === 0) {
      sheet.getCell(r, COL.name).value = "เพิ่มสินค้าใหม่ — พิมพ์ชื่อที่นี่";
      sheet.getCell(r, COL.name).font = baseFont({ bold: true, italic: true });
      sheet.getCell(r, COL.name).fill = solidFill("FFFFF2CC");
    }
    sheet.getCell(r, COL.net).value = { formula: `K${r}-L${r}` };
    sheet.getCell(r, COL.vat).value = { formula: `M${r}*${1 + VAT_RATE}` };
    sheet.getCell(r, COL.amount).value = { formula: `O${r}*M${r}` };
    styleRow(r);
  }

  // ---- แถวรวม ----
  // guard ช่วง SUM — เดิม fallback ไปชี้ `${col}${totalRow}` ทำให้เป็น =SUM(H4) ในเซลล์ H4 เอง
  const hasBody = sumLast >= dataStart;
  for (const col of ["O", "P"] as const) {
    const cell = sheet.getCell(`${col}${totalRow}`);
    cell.value = hasBody
      ? { formula: `SUM(${col}${dataStart}:${col}${sumLast})` }
      : 0;
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center" };
  }
  sheet.getCell(totalRow, COL.vat).value = "รวมทั้งหมด";
  sheet.getCell(totalRow, COL.vat).font = baseFont({ bold: true });
  sheet.getCell(totalRow, COL.vat).alignment = { horizontal: "right" };
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = sheet.getCell(totalRow, c);
    cell.border = thinBorder;
    if (!cell.font?.name) cell.font = baseFont({ bold: true });
    cell.fill = solidFill("FFE2E8F0");
  }
  sheet.getRow(totalRow).height = 22;

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: LAST_COL },
  };

  // meta: วันที่ export + ร้าน (ซ่อน) — ใช้ตรวจย้อนหลังว่าไฟล์มาจากรอบไหน
  sheet.getCell(1, COL.meta).value = `${bangkokDateStr(asOf)} · ${opts.storeName}`;
  sheet.getColumn(COL.meta).hidden = true;

  // ต้องตั้งหลังรู้ totalRow — printTitlesRow คือสิ่งที่ทำให้หน้า 2+ มีหัวคอลัมน์
  sheet.pageSetup.printArea = `A1:R${totalRow}`;
  sheet.pageSetup.printTitlesRow = "1:3";

  return sheet;
}
