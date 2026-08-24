import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { fabricStockReady, getAssortedMapping } from "@/lib/fabric";
import { bangkokDateStr } from "@/lib/fabric/bkk-date";
import { buildFabricStockPayload } from "@/lib/fabric/stock-rows";
import { resolveVdaStoreName } from "@/lib/fabric/vda-store-name";
import { buildPromoInspector } from "@/lib/promo/promo-inspector";
import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import { buildPromoTitle } from "@/lib/promo/promo-title";
import { formatPremiumUnit } from "@/lib/calculations";
import {
  isStockSortKey,
  sortStockRows,
  type StockSortDir,
} from "@/lib/stock/sort";
import { isStockView, selectStockRows } from "@/lib/stock/filters";
import {
  blockLabel,
  buildOrderFormSheet,
} from "@/lib/stock/export-order-form";
import {
  CUSTOMER_STORE_COOKIE,
  CUSTOMER_STORE_CODE_COOKIE,
} from "@/lib/auth/roles";
import type { StockRowComputed } from "@/lib/repositories/types";

const NUM_INT = "#,##0";
const NUM_1DP = "#,##0.0";
const NUM_BAHT = '#,##0.00';

type Col = {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
};

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

function freeGoodLabel(row: StockRowComputed): string {
  const fg = row.freeGood;
  if (!fg || fg.qty <= 0) return "";
  return `${fg.premiumName || fg.premiumProduct} ${fg.qty} ${fg.unitLabel}`;
}

/** พารามิเตอร์ที่รับได้ทั้งจาก query string (GET) และ JSON body (POST) */
interface ExportParams {
  fromDb?: string;
  brand?: string;
  section?: string;
  search?: string;
  view?: string;
  needsOnly?: string;
  hideNoSales?: string;
  sort?: string;
  dir?: string;
  /** "code:qty,code:qty" หรือ object — จำนวนที่ผู้ใช้ตั้งบนหน้าจอ */
  qty?: string | Record<string, number>;
  /** รหัส SKU ที่ติ๊กเลือกไว้ */
  selected?: string | string[];
  onlySelected?: string | boolean;
}

function paramsFromSearch(sp: URLSearchParams): ExportParams {
  const out: Record<string, unknown> = {};
  for (const k of [
    "fromDb",
    "brand",
    "section",
    "search",
    "view",
    "needsOnly",
    "hideNoSales",
    "sort",
    "dir",
    "qty",
    "selected",
    "onlySelected",
  ] as const) {
    const v = sp.get(k);
    if (v != null) out[k] = v;
  }
  return out as ExportParams;
}

function parseQtyMap(v: ExportParams["qty"]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v) return out;
  const put = (code: string, n: unknown) => {
    const q = Math.floor(Number(n));
    if (Number.isFinite(q) && q > 0) out[code.trim()] = q;
  };
  if (typeof v === "object") {
    for (const [code, n] of Object.entries(v)) put(code, n);
    return out;
  }
  for (const pair of v.split(",")) {
    const [code, n] = pair.split(":");
    if (code) put(code, n);
  }
  return out;
}

function parseSelected(v: ExportParams["selected"]): Set<string> {
  if (!v) return new Set();
  const list = Array.isArray(v) ? v : v.split(",");
  return new Set(list.map((c) => String(c).trim()).filter(Boolean));
}

async function buildWorkbook(
  storeId: string,
  storeCode: string,
  params: ExportParams
): Promise<ExcelJS.Workbook> {
  const fromDb = params.fromDb || storeCode;
  const brand = params.brand ?? "";
  const section = params.section ?? "";
  const search = (params.search ?? "").trim();
  // needsOnly = พารามิเตอร์เดิมของหน้าเก่า — รองรับต่อไปเผื่อมีคน bookmark ลิงก์ไว้
  const view = isStockView(params.view)
    ? params.view
    : params.needsOnly === "1"
      ? "needs"
      : "all";
  const hideNoSales = params.hideNoSales === "1";
  const sortKey = isStockSortKey(params.sort) ? params.sort : "code";
  const sortDir: StockSortDir = params.dir === "desc" ? "desc" : "asc";
  const qtyByCode = parseQtyMap(params.qty);
  const selectedCodes = parseSelected(params.selected);
  const onlySelected =
    params.onlySelected === "1" || params.onlySelected === true;

  const payload = await buildFabricStockPayload(storeId, storeCode, fromDb);

  // กรองแบบเดียวกับหน้าเว็บ เพื่อให้ไฟล์ตรงกับสิ่งที่ผู้ใช้เห็นบนจอ
  // (selectStockRows คือฟังก์ชันเดียวกับที่หน้าจอใช้ — รวมกฎ "ค้นหาชนะตัวกรอง" ไว้แล้ว)
  let rows = selectStockRows(payload.rows, {
    search,
    filters: {
      view,
      brand: brand || null,
      section: section || null,
      hideNoSales,
    },
  });
  // ส่งออกเต็นเฉพาะแถวที่ติ๊กเลือกไว้
  if (onlySelected && selectedCodes.size > 0) {
    rows = rows.filter((r) => selectedCodes.has(r.skuCode));
  }
  rows = sortStockRows(rows, sortKey, sortDir);

  const wb = new ExcelJS.Workbook();
  wb.creator = "VMI";
  wb.created = new Date();

  // ชื่อกลุ่มโปร — คงคอลัมน์รหัสกลุ่มไว้ด้วยเพื่อให้ pivot/vlookup ข้ามชีตได้เหมือนเดิม
  const assorted = getAssortedMapping();

  // ---- ชีต 1: ฟอร์มสั่ง (หน้าตาตามตัวอย่างฟอร์มสั่งสินค้า) ----
  const storeName =
    resolveVdaStoreName(fromDb) ||
    resolveVdaStoreName(storeCode) ||
    storeCode.toUpperCase();
  buildOrderFormSheet(wb, {
    storeName,
    rows,
    asOf: new Date(),
    qtyByCode,
  });

  // ---- ชีต 2: สต็อก (รายละเอียดเต็ม สำหรับวิเคราะห์) ----
  const stockSheet = wb.addWorksheet("สต็อก");
  applySheet(stockSheet, [
    { header: "รหัสสินค้า", key: "code", width: 12 },
    { header: "บาร์โค้ด", key: "barcode", width: 16 },
    { header: "ชื่อสินค้า", key: "name", width: 38 },
    { header: "แบรนด์", key: "brand", width: 18 },
    { header: "กลุ่มสินค้า", key: "section", width: 20 },
    { header: "ชิ้น/หีบ", key: "packSize", width: 9, numFmt: NUM_INT },
    { header: "คงเหลือ (หีบ)", key: "cases", width: 12, numFmt: NUM_INT },
    { header: "เศษ (ชิ้น)", key: "remainder", width: 10, numFmt: NUM_INT },
    { header: "คงเหลือ (ชิ้น)", key: "pieces", width: 13, numFmt: NUM_INT },
    { header: "ขายเฉลี่ย/วัน (หีบ)", key: "avg", width: 15, numFmt: NUM_1DP },
    { header: "CVD (วัน)", key: "cvd", width: 11, numFmt: NUM_1DP },
    { header: "ไม่ขาย 1 เดือน", key: "noSales", width: 13 },
    { header: "MIN (วัน)", key: "minDays", width: 10, numFmt: NUM_INT },
    { header: "MAX (วัน)", key: "maxDays", width: 10, numFmt: NUM_INT },
    { header: "แนะนำสั่ง (หีบ)", key: "suggest", width: 13, numFmt: NUM_INT },
    { header: "จำนวนสั่ง (หีบ)", key: "orderQty", width: 13, numFmt: NUM_INT },
    { header: "ราคา/หีบ", key: "price", width: 12, numFmt: NUM_BAHT },
    { header: "ส่วนลด (บาท/หีบ)", key: "discBaht", width: 15, numFmt: NUM_BAHT },
    { header: "ส่วนลด (%)", key: "discPct", width: 11, numFmt: NUM_1DP },
    { header: "ราคาสุทธิ/หีบ", key: "net", width: 13, numFmt: NUM_BAHT },
    { header: "มูลค่าคงเหลือ", key: "stockValue", width: 15, numFmt: NUM_BAHT },
    { header: "กลุ่มโปร", key: "promoGroup", width: 14 },
    { header: "ชื่อกลุ่มโปร", key: "promoGroupName", width: 34 },
    { header: "โปรปัจจุบัน", key: "currentPromo", width: 26 },
    { header: "โปรขั้นถัดไป", key: "nextPromo", width: 26 },
    { header: "ของแถม", key: "freeGood", width: 26 },
    { header: "สถานะหยุดสั่ง", key: "block", width: 34 },
  ]);

  for (const r of rows) {
    stockSheet.addRow({
      code: r.skuCode,
      barcode: r.barcode ?? "",
      name: r.skuName,
      brand: r.brand ?? "",
      section: r.section ?? "",
      packSize: r.packSize,
      cases: r.stockCases,
      remainder: r.stockRemainder,
      pieces: r.stockPieces,
      avg: r.avgQtyOutL7 ?? r.avgSales,
      cvd: r.stockCvd,
      noSales: r.noSales30 ? "ใช่" : "",
      minDays: r.minDays,
      maxDays: r.maxDays,
      suggest: r.suggestOrder,
      orderQty:
        qtyByCode[r.skuCode] ?? (r.suggestOrder > 0 ? r.suggestOrder : null),
      price: r.unitPrice,
      discBaht: r.discountBahtPerCase,
      discPct: r.discountPctPerCase,
      net: r.netUnitPrice ?? r.unitPrice,
      // ต้นทุนจริงที่คลังซื้อมาก่อน — ไม่มีค่อยประมาณจากราคาขาย (กติกาเดียวกับสรุปหน้าสต็อก)
      stockValue:
        r.stockValue ??
        (r.unitPrice != null ? r.stock * r.unitPrice : null),
      promoGroup: r.promoGroup ?? "",
      promoGroupName: assorted.nameFor(r.promoGroup),
      currentPromo: r.currentPromo ?? "",
      nextPromo: r.nextPromo
        ? `${r.nextPromo}${r.nextPromoQty != null ? ` (ที่ ${r.nextPromoQty} หีบ)` : ""}`
        : "",
      freeGood: freeGoodLabel(r),
      block: blockLabel(r),
    });
  }

  // ---- ชีต 3: โปรโมชั่น (1 แถว = 1 ขั้นบันได) ----
  const promoSheet = wb.addWorksheet("โปรโมชั่น");
  applySheet(promoSheet, [
    { header: "รหัสสินค้า", key: "code", width: 12 },
    { header: "ชื่อสินค้า", key: "name", width: 38 },
    { header: "กลุ่มโปร", key: "group", width: 14 },
    { header: "ชื่อกลุ่มโปร", key: "groupName", width: 34 },
    { header: "ตั้งแต่จำนวน (หีบ)", key: "fromQty", width: 16, numFmt: NUM_INT },
    { header: "ส่วนลด (บาท/หีบ)", key: "discBaht", width: 16, numFmt: NUM_BAHT },
    { header: "ส่วนลด (%)", key: "discPct", width: 11, numFmt: NUM_1DP },
    { header: "สินค้าแถม", key: "premiumCode", width: 12 },
    { header: "ชื่อสินค้าแถม", key: "premiumName", width: 32 },
    { header: "จำนวนแถม", key: "premiumQty", width: 11, numFmt: NUM_INT },
    { header: "หน่วยแถม", key: "premiumUnit", width: 10 },
  ]);

  for (const r of rows) {
    for (const t of r.promoTiers ?? []) {
      promoSheet.addRow({
        code: r.skuCode,
        name: r.skuName,
        group: r.promoGroup ?? "",
        groupName: assorted.nameFor(r.promoGroup),
        fromQty: t.minQty,
        discBaht: t.discBaht ?? null,
        discPct: t.discPct ?? null,
        premiumCode: t.premiumProduct ?? "",
        premiumName: t.premiumName ?? "",
        premiumQty: t.premiumQty ?? null,
        premiumUnit: t.premiumUnit ? formatPremiumUnit(t.premiumUnit) : "",
      });
    }
  }

  // ---- ชีต 4: โปรกลุ่ม (1 แถว = 1 ASSORTEDPRODUCTGROUP) ----
  const groupSheet = wb.addWorksheet("โปรกลุ่ม");
  applySheet(groupSheet, [
    { header: "ชื่อกลุ่มโปร", key: "groupName", width: 40 },
    { header: "ชื่อโปร", key: "promoName", width: 40 },
    { header: "กลุ่มโปร", key: "group", width: 14 },
    { header: "SKU ในกลุ่ม (C4)", key: "members", width: 15, numFmt: NUM_INT },
    { header: "SKU ในตารางนี้", key: "inTable", width: 13, numFmt: NUM_INT },
    { header: "รายชื่อ SKU ในตารางนี้", key: "skus", width: 46 },
    { header: "รวมที่แนะนำสั่ง (หีบ)", key: "poolQty", width: 18, numFmt: NUM_INT },
    { header: "ขั้นที่ได้ตอนนี้", key: "currentTier", width: 26 },
    { header: "ขั้นถัดไป", key: "nextTier", width: 26 },
    { header: "อีกกี่หีบถึงขั้นถัดไป", key: "qtyToNext", width: 18, numFmt: NUM_INT },
    { header: "ขั้นบันไดทั้งหมด", key: "ladder", width: 60 },
  ]);

  // รวมข้อมูลรายกลุ่มจากแถวที่ export (กลุ่มที่มีสมาชิก > 1 เท่านั้น = โปรที่รวมยอดกันได้)
  const groups = new Map<
    string,
    { skus: string[]; poolQty: number; row: StockRowComputed }
  >();
  for (const r of rows) {
    if (!isPooledPromoGroup(r.promoGroup, r.promoGroupMembers)) continue;
    const key = r.promoGroup!.trim();
    const entry = groups.get(key) ?? { skus: [], poolQty: 0, row: r };
    entry.skus.push(r.skuCode);
    entry.poolQty += r.suggestOrder;
    groups.set(key, entry);
  }

  for (const [group, entry] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true })
  )) {
    let ladder = "";
    try {
      const inspector = buildPromoInspector({ storeCode, group });
      ladder = inspector.ladder
        .map((t) => {
          const benefit = t.discBaht
            ? `ลด ${t.discBaht} บาท/หีบ`
            : t.discPct
              ? `ลด ${t.discPct}%`
              : t.premiumQty
                ? `แถม ${t.premiumName || t.premiumProduct} ${t.premiumQty} ${t.premiumUnitLabel}`
                : "-";
          return `≥${t.fromQty} หีบ: ${benefit}`;
        })
        .join(" | ");
    } catch {
      // promo master ยังไม่พร้อม — ปล่อยว่าง ไม่ทำให้ export ทั้งไฟล์ล้ม
    }

    groupSheet.addRow({
      // ชื่อจริงจาก cft_assorted_mapping — ว่างได้ (บางกลุ่มไม่มีคำอธิบาย)
      groupName: assorted.nameFor(group),
      // C4 ไม่มีคอลัมน์ชื่อโปร — สังเคราะห์จากเงื่อนไขเหมือนที่หน้าเว็บแสดง
      promoName: buildPromoTitle({
        group,
        tiers: entry.row.promoTiers,
        memberCount: entry.row.promoGroupMembers ?? entry.skus.length,
        endsInDays: entry.row.currentPromoEndsInDays ?? null,
      }).headline,
      group,
      // members = จำนวนสมาชิกใน C4 master ซึ่งอาจมากกว่าที่คลังนี้มีของ
      members: entry.row.promoGroupMembers ?? entry.skus.length,
      inTable: entry.skus.length,
      skus: entry.skus.join(", "),
      poolQty: entry.poolQty,
      currentTier: entry.row.currentPromo ?? "",
      nextTier: entry.row.nextPromo ?? "",
      qtyToNext: entry.row.qtyToNext,
      ladder,
    });
  }

  return wb;
}

async function requireStore(): Promise<
  | { ok: true; storeId: string; storeCode: string }
  | { ok: false; res: NextResponse }
> {
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;
  const storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value;

  if (!storeId || !storeCode) {
    return {
      ok: false,
      res: NextResponse.json({ error: "ไม่พบ session" }, { status: 401 }),
    };
  }
  if (!fabricStockReady()) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "ยังไม่พร้อมใช้งาน — ต้อง sync stock_cover_day ก่อน" },
        { status: 503 }
      ),
    };
  }
  return { ok: true, storeId, storeCode };
}

async function respondWithWorkbook(
  storeId: string,
  storeCode: string,
  params: ExportParams
): Promise<NextResponse> {
  const wb = await buildWorkbook(storeId, storeCode, params);
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `form-order-${storeCode.toLowerCase()}-${bangkokDateStr(new Date())}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const guard = await requireStore();
  if (!guard.ok) return guard.res;
  const { searchParams } = new URL(request.url);
  return respondWithWorkbook(
    guard.storeId,
    guard.storeCode,
    paramsFromSearch(searchParams)
  );
}

/**
 * POST รับพารามิเตอร์ชุดเดียวกันผ่าน JSON body
 * ใช้เมื่อรายการจำนวนที่ผู้ใช้แก้ยาวเกินกว่าที่ URL จะรองรับได้อย่างปลอดพัน
 */
export async function POST(request: Request) {
  const guard = await requireStore();
  if (!guard.ok) return guard.res;
  const body = (await request.json().catch(() => ({}))) as ExportParams;
  return respondWithWorkbook(guard.storeId, guard.storeCode, body);
}
