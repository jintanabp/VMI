import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { getSalesSession } from "@/lib/auth/sales-session";
import { getAssortedMapping } from "@/lib/fabric";
import { prisma } from "@/lib/prisma";
import { assertOrderAccess } from "@/lib/orders/access";
import { VAT_RATE, type PoDocument } from "@/lib/po/po-document";
import { rebuildPoDocumentFromDb } from "@/lib/po/po-from-db";
import { sanitizePoNumber } from "@/lib/po/po-number";
import { collectOwedFreeGoods } from "@/lib/promo/order-free-goods";

const NUM_INT = "#,##0";
const NUM_MONEY = "#,##0.00";

/** กันคำขอที่ใหญ่จนสร้างไฟล์ไม่ไหว — 50 ใบพอสำหรับงานประจำวัน */
const MAX_PO = 50;

const bodySchema = z.object({
  poNumbers: z.array(z.string().trim().min(1)).min(1).max(MAX_PO),
});

const SOURCE_LABEL: Record<string, string> = {
  sales: "พนักงานตั้ง",
  store: "ร้านขอ",
  c4: "ราคาระบบ",
  none: "ไม่มีราคา",
};

/**
 * ดาวน์โหลดหลาย PO เป็นไฟล์ Excel เดียว
 *
 * ชีตแรกเป็นสรุปทุกใบ ตามด้วยชีตรายละเอียดต่อ PO
 * (เดิมต้องกดโหลดทีละใบ — วันหนึ่งออก PO หลายสิบใบก็ต้องกดหลายสิบครั้ง)
 */
export async function POST(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `ต้องระบุ poNumbers 1–${MAX_PO} รายการ` },
      { status: 400 }
    );
  }

  const poNumbers = [
    ...new Set(parsed.data.poNumbers.map((p) => sanitizePoNumber(p))),
  ].filter(Boolean);
  if (poNumbers.length === 0) {
    return NextResponse.json({ error: "เลข PO ไม่ถูกต้อง" }, { status: 400 });
  }

  const rows = await prisma.purchaseOrder.findMany({
    where: { poNumber: { in: poNumbers } },
    select: { poNumber: true, orderId: true, exportPath: true },
    orderBy: { poNumber: "asc" },
  });
  if (rows.length === 0) {
    return NextResponse.json({ error: "ไม่พบ PO ที่เลือก" }, { status: 404 });
  }

  const docs: PoDocument[] = [];
  for (const row of rows) {
    // เช็คสิทธิ์ทีละใบ — เลือกมาปนกันแล้วมีใบนอก scope ต้องไม่หลุดออกไป
    try {
      await assertOrderAccess(row.orderId, session);
    } catch {
      continue;
    }
    let doc: PoDocument | null = null;
    if (row.exportPath) {
      try {
        doc = JSON.parse(await readFile(row.exportPath, "utf-8")) as PoDocument;
      } catch {
        doc = null;
      }
    }
    doc = doc ?? (await rebuildPoDocumentFromDb(row.poNumber));
    if (doc) docs.push(doc);
  }

  if (docs.length === 0) {
    return NextResponse.json(
      { error: "ไม่มี PO ที่คุณมีสิทธิ์ดาวน์โหลด" },
      { status: 403 }
    );
  }

  const assorted = getAssortedMapping();

  const wb = new ExcelJS.Workbook();
  wb.creator = "VMI";
  wb.created = new Date();

  // ---- ชีตสรุป ----
  const summary = wb.addWorksheet("สรุป");
  summary.getCell("A1").value = `สรุปใบสั่งซื้อ ${docs.length} ใบ`;
  summary.getCell("A1").font = { bold: true, size: 14 };
  const sumCols: { header: string; width: number; numFmt?: string }[] = [
    { header: "เลข PO", width: 16 },
    { header: "ร้าน / คลัง", width: 30 },
    { header: "ประเภทราคา", width: 12 },
    { header: "รายการ", width: 10, numFmt: NUM_INT },
    { header: "หีบ", width: 10, numFmt: NUM_INT },
    { header: "มูลค่า", width: 14, numFmt: NUM_MONEY },
    { header: "VAT", width: 12, numFmt: NUM_MONEY },
    { header: "รวมทั้งสิ้น", width: 14, numFmt: NUM_MONEY },
    { header: "ออกเมื่อ", width: 20 },
    { header: "โดย", width: 26 },
  ];
  sumCols.forEach((c, i) => {
    const cell = summary.getCell(3, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    summary.getColumn(i + 1).width = c.width;
    if (c.numFmt) summary.getColumn(i + 1).numFmt = c.numFmt;
  });
  docs.forEach((doc, i) => {
    const r = 4 + i;
    summary.getCell(r, 1).value = doc.poNumber;
    summary.getCell(r, 2).value = `${doc.storeCode.toUpperCase()} · ${doc.storeName}`;
    summary.getCell(r, 3).value = doc.priceKind;
    summary.getCell(r, 4).value = doc.itemCount;
    summary.getCell(r, 5).value = doc.totalQty;
    summary.getCell(r, 6).value = doc.totalAmount;
    summary.getCell(r, 7).value = doc.vatTotal;
    summary.getCell(r, 8).value = doc.grandTotal;
    summary.getCell(r, 9).value = new Date(doc.approvedAt).toLocaleString("th-TH");
    summary.getCell(r, 10).value = doc.approvedBy || "-";
  });
  const totalRow = 4 + docs.length;
  summary.getCell(totalRow, 3).value = "รวม";
  summary.getCell(totalRow, 4).value = docs.reduce((s, d) => s + d.itemCount, 0);
  summary.getCell(totalRow, 5).value = docs.reduce((s, d) => s + d.totalQty, 0);
  summary.getCell(totalRow, 6).value = docs.reduce((s, d) => s + d.totalAmount, 0);
  summary.getCell(totalRow, 7).value = docs.reduce((s, d) => s + d.vatTotal, 0);
  summary.getCell(totalRow, 8).value = docs.reduce((s, d) => s + d.grandTotal, 0);
  for (let c = 1; c <= sumCols.length; c++) {
    summary.getCell(totalRow, c).font = { bold: true };
  }
  summary.views = [{ state: "frozen", ySplit: 3 }];

  // ---- ชีตรายละเอียดต่อใบ ----
  const detailCols: { header: string; width: number; numFmt?: string }[] = [
    { header: "รหัสสินค้า", width: 13 },
    { header: "ชื่อสินค้า", width: 44 },
    { header: "จำนวน (หีบ)", width: 12, numFmt: NUM_INT },
    { header: "ราคา/หีบ", width: 12, numFmt: NUM_MONEY },
    { header: "ที่มาราคา", width: 13 },
    { header: "ส่วนลด/หีบ", width: 12, numFmt: NUM_MONEY },
    { header: "ราคาสุทธิ/หีบ", width: 13, numFmt: NUM_MONEY },
    { header: "มูลค่า", width: 14, numFmt: NUM_MONEY },
    { header: `VAT ${Math.round(VAT_RATE * 100)}%`, width: 12, numFmt: NUM_MONEY },
    { header: "โปรที่ได้", width: 24 },
    { header: "ของแถม", width: 26 },
    { header: "หมายเหตุราคา", width: 22 },
  ];

  for (const doc of docs) {
    // ชื่อชีต Excel ห้ามเกิน 31 ตัวและห้ามมี : \ / ? * [ ]
    const name = doc.poNumber.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
    const sheet = wb.addWorksheet(name, {
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true },
    });
    sheet.getCell("A1").value = `ใบสั่งซื้อ (PO) ${doc.poNumber}`;
    sheet.getCell("A1").font = { bold: true, size: 14 };
    sheet.getCell("A2").value = `${doc.storeCode.toUpperCase()} · ${doc.storeName}`;
    sheet.getCell("A3").value = `กลุ่ม ${doc.groupKey} (${doc.priceKind}) · ออกเมื่อ ${new Date(
      doc.approvedAt
    ).toLocaleString("th-TH")}`;

    const headerRow = 5;
    detailCols.forEach((c, i) => {
      const cell = sheet.getCell(headerRow, i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      sheet.getColumn(i + 1).width = c.width;
      if (c.numFmt) sheet.getColumn(i + 1).numFmt = c.numFmt;
    });

    doc.lines.forEach((l, i) => {
      const r = headerRow + 1 + i;
      sheet.getCell(r, 1).value = l.skuCode;
      sheet.getCell(r, 2).value = l.skuName;
      sheet.getCell(r, 3).value = l.qty;
      sheet.getCell(r, 4).value = l.unitPrice;
      sheet.getCell(r, 5).value = SOURCE_LABEL[l.priceSource] ?? l.priceSource;
      sheet.getCell(r, 6).value = l.discountBaht;
      sheet.getCell(r, 7).value = l.netUnitPrice;
      sheet.getCell(r, 8).value = l.amount;
      sheet.getCell(r, 9).value = l.vatAmount;
      sheet.getCell(r, 10).value = l.promoLabel ?? "";
      sheet.getCell(r, 11).value = l.freeGood
        ? `${l.freeGood.name} ${l.freeGood.qty}${l.freeGood.unit ? ` ${l.freeGood.unit}` : ""}`
        : "";
      if (l.priceFlagged) {
        sheet.getCell(r, 12).value = `ราคาไม่ตรง C4 (${l.priceFlagReason ?? ""})`;
        sheet.getCell(r, 12).font = { color: { argb: "FFC00000" } };
      }
    });

    const tr = headerRow + doc.lines.length + 1;
    sheet.getCell(tr, 2).value = "รวม";
    sheet.getCell(tr, 3).value = doc.totalQty;
    sheet.getCell(tr, 8).value = doc.totalAmount;
    sheet.getCell(tr, 9).value = doc.vatTotal;
    sheet.getCell(tr + 1, 2).value = "ยอดรวมทั้งสิ้น (รวม VAT)";
    sheet.getCell(tr + 1, 8).value = doc.grandTotal;
    for (const r of [tr, tr + 1]) {
      for (let c = 1; c <= detailCols.length; c++) {
        sheet.getCell(r, c).font = { bold: true };
      }
    }

    // ของแถมที่ต้องส่งของ PO ใบนี้ — dedupe โปรกลุ่มแล้ว
    const owed = collectOwedFreeGoods(doc.lines);
    if (owed.length > 0) {
      let r = tr + 3;
      sheet.getCell(r, 1).value = "ของแถมที่ต้องส่ง";
      sheet.getCell(r, 1).font = { bold: true, size: 12 };
      r++;
      ["รหัสของแถม", "ชื่อของแถม", "จำนวน", "หน่วย", "จากโปร/สินค้า"].forEach(
        (h, i) => {
          const cell = sheet.getCell(r, i + 1);
          cell.value = h;
          cell.font = { bold: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE2E8F0" },
          };
        }
      );
      for (const fg of owed) {
        r++;
        sheet.getCell(r, 1).value = fg.code;
        sheet.getCell(r, 2).value = fg.name;
        sheet.getCell(r, 3).value = fg.qty;
        sheet.getCell(r, 4).value = fg.unit;
        // ชื่อกลุ่มโปรอ่านรู้เรื่องกว่ารหัส — คงรหัสต่อท้ายไว้ให้เทียบกับ C4 ได้
        sheet.getCell(r, 5).value = fg.promoGroup
          ? `${assorted.labelFor(fg.promoGroup)} [${fg.promoGroup}] (${fg.fromSkuCodes.join(", ")})`
          : fg.fromSkuCodes.join(", ");
      }
    }
    sheet.views = [{ state: "frozen", ySplit: headerRow }];
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PO-${docs.length}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
