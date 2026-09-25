import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSalesSession } from "@/lib/auth/sales-session";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { bangkokDateStr } from "@/lib/fabric/bkk-date";
import { buildPromoMonthReport, type PromoMonthGroup } from "@/lib/promo/promo-month";
import { formatPremiumUnit } from "@/lib/calculations";
import {
  ownedVdaCodesForSession,
  pickPromoStoreCodes,
  resolvePromoVdaScope,
} from "@/lib/promo/promo-vda-scope";

// อ่านจาก directory ที่ reload ตาม mtime ของ CSV — cache ไว้จะเห็นข้อมูลเก่าหลัง sync (เหมือน /api/promo/month)
export const dynamic = "force-dynamic";

const NUM_INT = "#,##0";

type Col = { header: string; key: string; width: number; numFmt?: string };

function applySheet(sheet: ExcelJS.Worksheet, cols: Col[]) {
  sheet.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cols.length },
  };
}

/** ข้อความบันไดโปรแบบเดียวกับที่ใช้ในชีต "โปรกลุ่ม" ของ /api/stock/export */
function ladderText(group: PromoMonthGroup): string {
  return group.tiers
    .map((t) => {
      const benefit = t.discBaht
        ? `ลด ${t.discBaht} บาท/หีบ`
        : t.discPct
          ? `ลด ${t.discPct}%`
          : t.premiumQty
            ? `แถม ${t.premiumName || t.premiumProduct} ${t.premiumQty} ${formatPremiumUnit(t.premiumUnit ?? "")}`
            : "-";
      return `≥${t.minQty} หีบ: ${benefit}`;
    })
    .join(" | ");
}

export async function GET(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allStores = listStockFromDbSources();
  const scope = resolvePromoVdaScope(
    session,
    allStores,
    session.role === "admin" ? allStores : ownedVdaCodesForSession(session)
  );

  const requested = new URL(request.url).searchParams.get("vdaCode");
  const storeCodes = pickPromoStoreCodes(scope, requested);
  if (storeCodes === null) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์ดูโปรของคลังนี้" },
      { status: 403 }
    );
  }
  if (storeCodes.length === 0) {
    return NextResponse.json(
      { error: "ยังไม่มีคลังในความดูแล" },
      { status: 400 }
    );
  }

  let report;
  try {
    report = buildPromoMonthReport({ storeCodes });
  } catch (err) {
    if (err instanceof Error && err.message === "PROMO_NOT_LOADED") {
      return NextResponse.json(
        { error: "ข้อมูลโปรโมชั่นยังไม่พร้อม — ต้อง sync ไฟล์โปรจาก Fabric ก่อน" },
        { status: 503 }
      );
    }
    throw err;
  }

  const wb = new ExcelJS.Workbook();

  const groupSheet = wb.addWorksheet("กลุ่มโปร");
  applySheet(groupSheet, [
    { header: "ชื่อกลุ่มโปร", key: "groupName", width: 30 },
    { header: "เงื่อนไข", key: "headline", width: 40 },
    { header: "รหัสกลุ่ม C4", key: "group", width: 14 },
    { header: "จำนวน SKU", key: "skuCount", width: 12, numFmt: NUM_INT },
    { header: "รายชื่อ SKU", key: "skus", width: 46 },
    { header: "ขั้นต่ำสั่ง (หีบ)", key: "minPurchase", width: 16, numFmt: NUM_INT },
    { header: "เริ่ม", key: "fromDate", width: 12 },
    { header: "ถึง", key: "toDate", width: 12 },
    { header: "ใช้ได้ตอนนี้", key: "activeNow", width: 12 },
    { header: "ขั้นบันไดทั้งหมด", key: "ladder", width: 60 },
  ]);
  for (const group of report.groups) {
    groupSheet.addRow({
      groupName: group.groupName,
      headline: group.headline,
      group: group.group,
      skuCount: group.skus.length,
      skus: group.skus.map((s) => s.code).join(", "),
      minPurchase: group.minPurchase,
      fromDate: group.fromDate,
      toDate: group.toDate,
      activeNow: group.activeNow ? "ใช้ได้" : "",
      ladder: ladderText(group),
    });
  }

  const regionSheet = wb.addWorksheet("ตามภาค");
  applySheet(regionSheet, [
    { header: "ภาค", key: "region", width: 16 },
    { header: "จำนวนแถวโปร", key: "rows", width: 14, numFmt: NUM_INT },
    { header: "ให้สิทธิประโยชน์จริง", key: "rowsWithBenefit", width: 16, numFmt: NUM_INT },
    { header: "จำนวน SKU", key: "skus", width: 12, numFmt: NUM_INT },
    { header: "คลัง/ร้านในภาคนี้", key: "stores", width: 40 },
  ]);
  for (const r of report.regions) {
    regionSheet.addRow({
      region: r.region,
      rows: r.rows,
      rowsWithBenefit: r.rowsWithBenefit,
      skus: r.skus,
      stores: r.stores.join(", "),
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `promo-groups-${report.month}-${bangkokDateStr(new Date())}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
