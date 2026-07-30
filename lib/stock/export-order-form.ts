import type ExcelJS from "exceljs";
import type { StockRowComputed } from "@/lib/repositories/types";
import type { PromoTierInput } from "@/lib/calculations";
import { bangkokDateStr } from "@/lib/fabric/bkk-date";

const FONT = "Browallia New";
const FONT_SIZE = 14;
const NUM_INT = "#,##0";
const NUM_ACCT = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
const NUM_ACCT_DP = '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)';

/** สีคอลัมน์วันสั่ง J–Q ตามตัวอย่างฟอร์ม */
const DAY_FILLS = [
  "FF00CCFF",
  "FFFF99FF",
  "FFFFC000",
  "FFD9E2F3",
  "FFC6EFCE",
  "FFFCE4D6",
  "FFDDEBF7",
  "FF99FF66",
] as const;

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

function bangkokDateParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    m: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

/** ข้อความโปรโชว์ในคอลัมน์ R ให้ใกล้เคียงตัวอย่าง "ลดหีบละ 600" */
export function formatOrderFormPromo(row: StockRowComputed): string {
  const tiers = (row.promoTiers ?? []).filter((t) => {
    const kind = t.kind ?? "none";
    return (
      kind === "discount_baht" ||
      kind === "discount_pct" ||
      kind === "premium"
    );
  });

  if (tiers.length === 0) {
    return row.currentPromo?.trim() || "";
  }

  if (tiers.length === 1) {
    return formatSingleTierPromo(tiers[0]!);
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
    return `${tier.minQty} หีบฟรี ${qty} ${name}`;
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
}

/**
 * สร้างชีต "ฟอร์มสั่ง" ให้หน้าตาใกล้เคียงตัวอย่างฟอร์มสั่งสินค้า
 * — คอลัมน์วัน J–Q ว่างให้กรอกเอง / ใส่จำนวนแนะนำในคอลัมน์วันล่าสุด (เขียว)
 */
export function buildOrderFormSheet(
  wb: ExcelJS.Workbook,
  opts: OrderFormExportOptions
): ExcelJS.Worksheet {
  const asOf = opts.asOf ?? new Date();
  const blankNew = Math.max(0, opts.blankNewRows ?? 3);
  const dataStart = 4;
  const productCount = opts.rows.length;
  const dataEnd = productCount > 0 ? dataStart + productCount - 1 : dataStart - 1;
  // แถวว่างท้ายตาราง (โครงสร้างสูตรครบ) สำหรับพิมพ์สินค้าเพิ่มเอง
  const blankStart = dataEnd + 1;
  const blankEnd = blankStart + blankNew - 1;
  const totalRow = blankEnd + 1;
  const sumLast = totalRow - 1;

  const sheet = wb.addWorksheet("ฟอร์มสั่ง", {
    views: [
      {
        state: "frozen",
        xSplit: 5,
        ySplit: 3,
        topLeftCell: "F4",
        activeCell: "F4",
      },
    ],
    properties: { defaultRowHeight: 20 },
  });

  sheet.columns = [
    { key: "no", width: 7 },
    { key: "name", width: 50 },
    { key: "price", width: 8 },
    { key: "disc", width: 8 },
    { key: "net", width: 8 },
    { key: "vat", width: 9 },
    { key: "pack", width: 7.5 },
    { key: "qty", width: 10 },
    { key: "amount", width: 11 },
    ...DAY_FILLS.map((_, i) => ({ key: `d${i}`, width: i < 3 ? 10 : 8 })),
    { key: "promoCredit", width: 40 },
    { key: "promoVan", width: 40 },
  ];

  // ---- Row 1: title / รวม / วันที่ ----
  const r1 = sheet.getRow(1);
  r1.height = 22;
  sheet.getCell("B1").value = "แบบฟอร์มสั่งสินค้า";
  sheet.getCell("B1").font = baseFont({ bold: true, size: 18 });

  sheet.mergeCells("H1:I1");
  sheet.getCell("H1").value = "ยอดสั่งซื้อรวม";
  sheet.getCell("H1").font = baseFont({ bold: true });
  sheet.getCell("H1").alignment = { horizontal: "center", vertical: "middle" };

  for (let i = 0; i < 8; i++) {
    const cell = sheet.getCell(1, 10 + i);
    cell.fill = solidFill(DAY_FILLS[i]!);
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.numFmt = "dd/mm/yy";
  }
  // ใส่วันที่ในคอลัมน์วันสุดท้าย (เขียว) — คอลัมน์อื่นให้ผู้ใช้ใส่เอง
  const { y, m, day } = bangkokDateParts(asOf);
  sheet.getCell("Q1").value = new Date(Date.UTC(y, m - 1, day));

  sheet.mergeCells("R1:S1");
  sheet.getCell("R1").value = thaiMonthYear(asOf);
  sheet.getCell("R1").font = baseFont({ bold: true });
  sheet.getCell("R1").alignment = { horizontal: "center", vertical: "middle" };

  // ---- Row 2: ชื่อร้าน / มูลค่ารวม ----
  const r2 = sheet.getRow(2);
  r2.height = 20;
  sheet.getCell("B2").value = opts.storeName || "";
  sheet.getCell("B2").font = baseFont({ bold: true });

  sheet.getCell("F2").value = "มูลค่า";
  sheet.getCell("F2").font = baseFont({ bold: true });
  sheet.getCell("F2").alignment = { horizontal: "center" };

  sheet.getCell("H2").value = { formula: `H${totalRow}` };
  sheet.getCell("I2").value = { formula: `I${totalRow}` };
  for (const col of ["H", "I"] as const) {
    const cell = sheet.getCell(`${col}2`);
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center" };
    cell.numFmt = NUM_ACCT;
  }

  for (let i = 0; i < 8; i++) {
    const col = 10 + i;
    const helperCol = 22 + i; // V..AC
    const cell = sheet.getCell(2, col);
    cell.value = {
      formula: `${colLetter(helperCol)}3`,
    };
    cell.fill = solidFill(DAY_FILLS[i]!);
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center" };
    cell.numFmt = NUM_ACCT_DP;
  }

  // ---- Row 3: headers ----
  const headers: Array<[number, string]> = [
    [1, "#"],
    [2, "Name"],
    [3, "ราคา/หีบ"],
    [4, "ส่วนลด"],
    [5, "ราคา"],
    [6, "รวมVAT"],
    [7, "บรรจุ"],
    [8, "รวมสั่ง"],
    [9, "มูลค่า"],
  ];
  for (const [col, text] of headers) {
    const cell = sheet.getCell(3, col);
    cell.value = text;
    cell.font = baseFont({ bold: true, ...(col === 4 ? { color: { argb: "FFFF0000" } } : {}) });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  }
  for (let i = 0; i < 8; i++) {
    const cell = sheet.getCell(3, 10 + i);
    cell.value = { formula: `${colLetter(10 + i)}${totalRow}` };
    cell.fill = solidFill(DAY_FILLS[i]!);
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.numFmt = NUM_INT;
    cell.border = thinBorder;
  }
  sheet.getCell("R3").value = "รายการโปรโมชั่น";
  sheet.getCell("S3").value = "หมายเหตุ / โปรเพิ่มเติม";
  for (const col of [18, 19] as const) {
    const cell = sheet.getCell(3, col);
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  }
  sheet.getRow(3).height = 22;

  // ---- Data rows ----
  opts.rows.forEach((row, idx) => {
    const r = dataStart + idx;
    const excelRow = sheet.getRow(r);
    excelRow.height = 20;

    const disc = discountBaht(row);
    const listPrice = row.unitPrice ?? null;
    const promo = formatOrderFormPromo(row);
    const suggest = row.suggestOrder > 0 ? row.suggestOrder : null;

    sheet.getCell(r, 1).value = idx + 1;
    sheet.getCell(r, 2).value = `[${row.skuCode}] ${row.skuName}`;
    if (listPrice != null) sheet.getCell(r, 3).value = listPrice;
    if (disc != null) {
      const dCell = sheet.getCell(r, 4);
      dCell.value = disc;
      dCell.font = baseFont({ color: { argb: "FFFF0000" } });
    }
    sheet.getCell(r, 5).value = { formula: `C${r}-D${r}` };
    sheet.getCell(r, 6).value = { formula: `E${r}*1.07` };
    sheet.getCell(r, 7).value = row.packSize;
    sheet.getCell(r, 8).value = {
      formula: `SUBTOTAL(109,J${r}:Q${r})`,
    };
    sheet.getCell(r, 9).value = { formula: `H${r}*E${r}` };

    // ใส่จำนวนแนะนำในคอลัมน์วันเขียว (Q) — คอลัมน์อื่นว่างให้วางแผนวันส่ง
    if (suggest != null) sheet.getCell(r, 17).value = suggest;

    sheet.getCell(r, 18).value = promo;
    if (row.nextPromo) {
      const hint =
        row.qtyToNext != null
          ? `อีก ${row.qtyToNext} หีบ → ${row.nextPromo}`
          : row.nextPromo;
      sheet.getCell(r, 19).value = hint;
    } else if (row.isNew) {
      sheet.getCell(r, 19).value = "สินค้าใหม่";
    }

    // ไฮไลต์แถวสินค้าใหม่ / ต้อง approve แบบตัวอย่าง (ส้มอ่อน)
    if (row.isNew) {
      sheet.getCell(r, 1).fill = solidFill("FFFFC000");
      sheet.getCell(r, 2).fill = solidFill("FFFFC000");
      sheet.getCell(r, 18).fill = solidFill("FFFFC000");
    }

    for (let c = 1; c <= 19; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder;
      if (!cell.font?.name) cell.font = baseFont();
      if (c !== 2 && c < 18) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      if (c >= 3 && c <= 9) cell.numFmt = NUM_INT;
      if (c >= 10 && c <= 17) cell.numFmt = NUM_INT;
    }

    // Helper V–AC = qty * net price ต่อวัน (รองรับสูตรมูลค่ารายวันแถว 2)
    for (let i = 0; i < 8; i++) {
      const dayCol = colLetter(10 + i);
      const helperCol = colLetter(22 + i);
      sheet.getCell(`${helperCol}${r}`).value = {
        formula: `${dayCol}${r}*$E${r}`,
      };
    }
  });

  // ---- แถวว่างสำหรับเพิ่มสินค้าใหม่ (โครงสร้างเดียวกับแถวสินค้า) ----
  for (let i = 0; i < blankNew; i++) {
    const r = blankStart + i;
    const n = productCount + i + 1;
    sheet.getCell(r, 1).value = n;
    if (i === 0) {
      sheet.getCell(r, 2).value = "เพิ่มสินค้าใหม่ — พิมพ์ชื่อที่นี่";
      sheet.getCell(r, 2).fill = solidFill("FFFF99FF");
      sheet.getCell(r, 2).font = baseFont({ bold: true, italic: true });
    }
    sheet.getCell(r, 5).value = { formula: `C${r}-D${r}` };
    sheet.getCell(r, 6).value = { formula: `E${r}*1.07` };
    sheet.getCell(r, 8).value = { formula: `SUBTOTAL(109,J${r}:Q${r})` };
    sheet.getCell(r, 9).value = { formula: `H${r}*E${r}` };

    for (let c = 1; c <= 19; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder;
      if (!cell.font?.name) cell.font = baseFont();
      if (c !== 2 && c < 18) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      if (c >= 3 && c <= 17) cell.numFmt = NUM_INT;
    }

    for (let i2 = 0; i2 < 8; i2++) {
      const dayCol = colLetter(10 + i2);
      const helperCol = colLetter(22 + i2);
      sheet.getCell(`${helperCol}${r}`).value = {
        formula: `${dayCol}${r}*$E${r}`,
      };
    }
  }

  // ---- Totals row ----
  const sumRange = (col: string) =>
    sumLast >= dataStart
      ? `${col}${dataStart}:${col}${sumLast}`
      : `${col}${totalRow}`;

  for (const col of ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"] as const) {
    const cell = sheet.getCell(`${col}${totalRow}`);
    cell.value = { formula: `SUM(${sumRange(col)})` };
    cell.font = baseFont({ bold: true });
    cell.alignment = { horizontal: "center" };
    cell.numFmt = NUM_INT;
  }
  for (let i = 0; i < 8; i++) {
    sheet.getCell(totalRow, 10 + i).fill = solidFill(DAY_FILLS[i]!);
  }

  for (let i = 0; i < 8; i++) {
    const helperCol = colLetter(22 + i);
    sheet.getCell(`${helperCol}${totalRow}`).value = {
      formula: `SUM(${sumRange(helperCol)})`,
    };
    // header row 3 helper pointers used by J2:Q2
    sheet.getCell(`${helperCol}3`).value = {
      formula: `${helperCol}${totalRow}`,
    };
    sheet.getCell(`${helperCol}3`).font = baseFont({ bold: true });
  }

  // ซ่อนคอลัมน์ helper V–AC (มูลค่ารายวัน)
  for (let c = 22; c <= 29; c++) {
    sheet.getColumn(c).hidden = true;
    sheet.getColumn(c).width = 10;
  }

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 19 },
  };

  // meta: วันที่ export เก็บไว้ที่มุม (ไม่บังคับโชว์)
  sheet.getCell("U1").value = bangkokDateStr(asOf);
  sheet.getColumn(21).hidden = true;

  return sheet;
}

function colLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
