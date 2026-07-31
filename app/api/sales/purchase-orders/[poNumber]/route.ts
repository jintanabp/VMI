import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import { assertOrderAccess } from "@/lib/orders/access";
import { VAT_RATE, type PoDocument } from "@/lib/po/po-document";
import { sanitizePoNumber } from "@/lib/po/po-number";
import { rebuildPoDocumentFromDb } from "@/lib/po/po-from-db";
import { isPoStatus } from "@/lib/po/po-status";
import { collectOwedFreeGoods } from "@/lib/promo/order-free-goods";

/**
 * เปลี่ยนสถานะ PO (ออกแล้ว → ส่งซัพ → รับของ / ยกเลิก)
 *
 * ไม่มี state machine บังคับลำดับ — flow จริงยังไม่นิ่ง และของจริงมีเคสข้ามขั้น
 * (เช่น ออกแล้วยกเลิกเลย) บันทึกว่าใครเปลี่ยนเมื่อไรไว้แทน
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ poNumber: string }> }
) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { poNumber: raw } = await ctx.params;
  const poNumber = sanitizePoNumber(decodeURIComponent(raw));
  if (!poNumber) {
    return NextResponse.json({ error: "เลข PO ไม่ถูกต้อง" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    note?: unknown;
  } | null;
  if (!isPoStatus(body?.status)) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  }
  const note =
    typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    select: { orderId: true },
  });
  if (!po) {
    return NextResponse.json({ error: "ไม่พบ PO" }, { status: 404 });
  }
  try {
    await assertOrderAccess(po.orderId, session);
  } catch {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ PO นี้" }, { status: 403 });
  }

  const updated = await prisma.purchaseOrder.update({
    where: { poNumber },
    data: {
      status: body.status,
      statusAt: new Date(),
      statusBy: session.email,
      statusNote: note,
    },
    select: { poNumber: true, status: true, statusAt: true, statusBy: true },
  });

  return NextResponse.json(updated);
}

const NUM_INT = "#,##0";
const NUM_MONEY = "#,##0.00";

/**
 * ดาวน์โหลดเอกสาร PO
 * `?format=json` = ไฟล์ที่เขียนไว้ตอนอนุมัติ · default = Excel สำหรับส่งต่อ
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ poNumber: string }> }
) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { poNumber: raw } = await ctx.params;
  const poNumber = sanitizePoNumber(decodeURIComponent(raw));
  if (!poNumber) {
    return NextResponse.json({ error: "เลข PO ไม่ถูกต้อง" }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    select: { orderId: true, exportPath: true, groupKey: true },
  });
  if (!po) {
    return NextResponse.json({ error: "ไม่พบเอกสาร PO" }, { status: 404 });
  }

  // สิทธิ์ผูกกับออเดอร์ต้นทาง — เซลส์ดูได้เฉพาะคลังที่ดูแล
  try {
    await assertOrderAccess(po.orderId, session);
  } catch {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดู PO นี้" }, { status: 403 });
  }

  // ไฟล์ที่เขียนตอนอนุมัติคือแหล่งอ้างอิงหลัก — แต่ถ้าไฟล์หาย/ย้าย
  // ประกอบใหม่จาก DB แทนที่จะคืน 410 แล้วดู PO ไม่ได้เลย
  let doc: PoDocument | null = null;
  if (po.exportPath) {
    try {
      doc = JSON.parse(await readFile(po.exportPath, "utf-8")) as PoDocument;
    } catch {
      doc = null;
    }
  }
  if (!doc) {
    doc = await rebuildPoDocumentFromDb(poNumber);
  }
  if (!doc) {
    return NextResponse.json(
      { error: "อ่านเอกสาร PO ไม่สำเร็จ" },
      { status: 410 }
    );
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  // json = ดาวน์โหลดไฟล์ · view = อ่านบนหน้าเว็บ (ไม่ต้องโหลดไฟล์)
  if (format === "json" || format === "view") {
    return NextResponse.json(doc);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "VMI";
  wb.created = new Date();
  const sheet = wb.addWorksheet(`PO ${doc.poNumber}`, {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  // ---- หัวเอกสาร ----
  sheet.getCell("A1").value = `ใบสั่งซื้อ (PO) ${doc.poNumber}`;
  sheet.getCell("A1").font = { bold: true, size: 16 };
  const head: [string, string][] = [
    ["ร้าน / คลัง", `${doc.storeCode.toUpperCase()} · ${doc.storeName}`],
    ["กลุ่ม PO", `${doc.groupKey} (${doc.priceKind})`],
    ["อนุมัติเมื่อ", new Date(doc.approvedAt).toLocaleString("th-TH")],
    ["อนุมัติโดย", doc.approvedBy || "-"],
    ["อ้างอิงออเดอร์", doc.orderId],
  ];
  head.forEach(([k, v], i) => {
    const r = 2 + i;
    sheet.getCell(`A${r}`).value = k;
    sheet.getCell(`A${r}`).font = { bold: true };
    sheet.getCell(`B${r}`).value = v;
  });

  const headerRow = 2 + head.length + 1;
  const cols: { header: string; width: number; numFmt?: string }[] = [
    { header: "รหัสสินค้า", width: 13 },
    { header: "ชื่อสินค้า", width: 44 },
    { header: "จำนวน (หีบ)", width: 12, numFmt: NUM_INT },
    { header: "ราคา/หีบ", width: 12, numFmt: NUM_MONEY },
    { header: "ที่มาราคา", width: 13 },
    { header: "ส่วนลด/หีบ", width: 12, numFmt: NUM_MONEY },
    { header: "ราคาสุทธิ/หีบ", width: 13, numFmt: NUM_MONEY },
    { header: "มูลค่า", width: 14, numFmt: NUM_MONEY },
    { header: `VAT ${VAT_RATE * 100}%`.replace(".000000000000001", ""), width: 12, numFmt: NUM_MONEY },
    { header: "โปรที่ได้", width: 24 },
    { header: "ของแถม", width: 26 },
    { header: "หมายเหตุราคา", width: 22 },
  ];
  cols.forEach((c, i) => {
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

  const SOURCE_LABEL: Record<string, string> = {
    sales: "พนักงานตั้ง",
    store: "ร้านขอ",
    c4: "ราคาระบบ",
    none: "ไม่มีราคา",
  };

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
    // ของแถมของโปรกลุ่มติดมาทุกบรรทัด — ตรงนี้แสดงตามบรรทัดได้ (เป็นบริบท)
    // แต่ยอดที่ต้องส่งจริงอยู่ในบล็อกสรุปด้านล่างที่ dedupe แล้ว
    sheet.getCell(r, 11).value = l.freeGood
      ? `${l.freeGood.name} ${l.freeGood.qty}${l.freeGood.unit ? ` ${l.freeGood.unit}` : ""}`
      : "";
    if (l.priceFlagged) {
      sheet.getCell(r, 12).value = `ราคาไม่ตรง C4 (${l.priceFlagReason ?? ""})`;
      sheet.getCell(r, 12).font = { color: { argb: "FFC00000" } };
    }
  });

  const totalRow = headerRow + doc.lines.length + 1;
  sheet.getCell(totalRow, 2).value = "รวม";
  sheet.getCell(totalRow, 3).value = doc.totalQty;
  sheet.getCell(totalRow, 8).value = doc.totalAmount;
  sheet.getCell(totalRow, 9).value = doc.vatTotal;
  sheet.getCell(totalRow + 1, 2).value = "ยอดรวมทั้งสิ้น (รวม VAT)";
  sheet.getCell(totalRow + 1, 8).value = doc.grandTotal;
  for (const r of [totalRow, totalRow + 1]) {
    for (let c = 1; c <= cols.length; c++) {
      sheet.getCell(r, c).font = { bold: true };
    }
  }

  // ---- ของแถมที่ต้องส่ง (dedupe โปรกลุ่มแล้ว) ----
  // นี่คือตัวเลขที่ฝ่ายจัดซื้อใช้จริง — ห้ามอ่านจากคอลัมน์ "ของแถม" รายบรรทัดแล้วบวกเอง
  const owed = collectOwedFreeGoods(doc.lines);
  if (owed.length > 0) {
    let r = totalRow + 3;
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
      sheet.getCell(r, 5).value = fg.promoGroup
        ? `กลุ่ม ${fg.promoGroup} (${fg.fromSkuCodes.join(", ")})`
        : fg.fromSkuCodes.join(", ");
    }
  }

  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PO-${doc.poNumber}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
