import fs from "fs";
import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { isBenefitTier } from "@/lib/calculations";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
  promoLoadError,
} from "@/lib/fabric";
import { getPromotionCsvPath } from "@/lib/fabric/paths";
import {
  promoActiveOn,
  promoServesMonthOf,
  promoServesRegion,
  tierMinQty,
  type PromoRow,
} from "@/lib/fabric/promotion-credit";
import { resolvePromoContext } from "@/lib/fabric/promotion-context";
import {
  filterCandidateRows,
  isEmptyBenefitRow,
  normalizeRegion,
  promoRowsToTiers,
} from "@/lib/fabric/promotion-lookup";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";

export const dynamic = "force-dynamic";

const REGIONS = [
  "COUNTRY",
  "BANGKOK",
  "CENTRAL",
  "NORTHEAST",
  "NORTH",
  "SOUTH",
] as const;

/**
 * ด่านที่ตีแถวนี้ตก — null = แถวนี้ผ่านทุกด่านและถูกใช้จริง
 *
 * ต้องเรียงตามลำดับเดียวกับ filterCandidateRows() เป๊ะ ๆ ไม่งั้นหน้านี้จะอธิบาย
 * คนละเหตุผลกับที่ระบบตัดสินจริง ซึ่งแย่กว่าไม่มีหน้านี้เลย
 */
function rejectionOf(
  row: PromoRow,
  ctx: { division: string; cusgroup: string },
  region: string,
  day: Date
): string | null {
  if (row.division !== ctx.division || row.cusgroup !== ctx.cusgroup) {
    return `คนละบริบท — แถวนี้เป็น ${row.division}|${row.cusgroup} แต่คลังนี้ค้นด้วย ${ctx.division}|${ctx.cusgroup}`;
  }
  if (!promoServesMonthOf(row, day)) {
    return `คนละเดือน — แถวนี้ใช้ได้ ${row.fromDate?.toISOString().slice(0, 10) ?? "ไม่ระบุ"} ถึง ${row.toDate?.toISOString().slice(0, 10) ?? "ไม่ระบุ"} ซึ่งไม่ทับเดือนปัจจุบัน`;
  }
  if (!promoServesRegion(row, region)) {
    const flags = REGIONS.filter((r) => row.regions.has(r));
    return `คนละภาค — แถวนี้ให้เฉพาะ ${flags.join("+") || "(ไม่ติดธงภาคใดเลย)"} แต่คลังนี้ถามด้วย ${region}`;
  }
  if (isEmptyBenefitRow(row)) {
    return "แถวนี้ไม่มีส่วนลดและไม่มีของแถม — จับกลุ่มไว้เฉย ๆ";
  }
  return null;
}

function describe(row: PromoRow) {
  return {
    division: row.division,
    cusgroup: row.cusgroup,
    group: (row.raw.ASSORTEDPRODUCTGROUP ?? "").trim() || null,
    fromQty: row.fromQty,
    toQty: row.toQty,
    minPurchase: row.minPurchase,
    /** จำนวนที่ต้องซื้อจริง — fromQty ดิบ ๆ หลอกตา เพราะ C4 เขียนขั้นแรกเป็น 1 เสมอ */
    tierMinQty: tierMinQty(row),
    regions: REGIONS.filter((r) => row.regions.has(r)),
    fromDate: row.fromDate?.toISOString().slice(0, 10) ?? null,
    toDate: row.toDate?.toISOString().slice(0, 10) ?? null,
    discountBaht: row.discAmt || null,
    discountPct: row.discPct || null,
    premiumProduct: row.premiumProduct || null,
    premiumQty: row.premiumQty || null,
    premiumUnit: row.premiumUnit || null,
    recordStatus: (row.raw.RECORDSTATUS ?? "").trim() || null,
    updateDate: (row.raw.UPDATEDATE ?? "").trim() || null,
  };
}

/**
 * บอกว่าทำไม SKU ตัวหนึ่งถึงมี/ไม่มีโปรบนเครื่องที่กำลังรันอยู่
 *
 * GET /api/admin/promo/explain?sku=426544&store=vda1
 *
 * ทำไมต้องมี: โหมดล้มของ C4 เงียบทั้งหมด — ไฟล์โหลดผ่าน ไม่มี error สักบรรทัด
 * แต่คอลัมน์ "โปร" เป็น "—" แล้วไม่มีอะไรบอกได้ว่าตกที่ด่านไหน ระหว่าง
 * (บริบทไม่ตรง / นอกช่วงวันที่ / คนละภาค / แถวไม่มีสิทธิประโยชน์ / ไม่มีแถวเลย)
 * ที่ผ่านมาต้องเดาทีละข้อโดยเทียบกับเครื่อง dev ซึ่งคนละไฟล์กัน พิสูจน์อะไรไม่ได้
 *
 * ตอบจาก directory ที่ process นี้โหลดอยู่จริง พร้อม mtime ของไฟล์ — จึงใช้ยืนยัน
 * ได้ด้วยว่า server ถือ snapshot รอบไหนอยู่ ไม่ต้อง exec เข้า container ไปไล่ CSV เอง
 */
export async function GET(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sku = (searchParams.get("sku") ?? "").trim();
  if (!sku) {
    return NextResponse.json(
      { error: "ต้องระบุ ?sku=<รหัสสินค้า>" },
      { status: 400 }
    );
  }

  if (!fabricPromoReady()) {
    return NextResponse.json(
      {
        sku,
        verdict: "ไฟล์โปรยังไม่โหลด",
        promoReady: false,
        promoError: promoLoadError(),
      },
      { status: 200 }
    );
  }

  const sources = listStockFromDbSources();
  const store = (searchParams.get("store") ?? "").trim() || sources[0] || "";
  const day = searchParams.get("day")
    ? new Date(`${searchParams.get("day")}T00:00:00+07:00`)
    : new Date();

  const dir = getPromotionCreditDirectory();
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;
  const ctx = resolvePromoContext(store);
  const region = normalizeRegion(ctx.region);

  const csvPath = getPromotionCsvPath();
  const stat = fs.existsSync(csvPath) ? fs.statSync(csvPath) : null;
  const allRows = dir.allRows();

  const inContext = dir.rowsFor(ctx.division, ctx.cusgroup, sku);
  const candidates = filterCandidateRows(
    dir,
    ctx.division,
    ctx.cusgroup,
    sku,
    ctx.region,
    day
  );
  const tiers = promoRowsToTiers(candidates, {
    packSizeOf: (c) => skuDir?.packSizeForSku(c) ?? 1,
    nameOf: (c) => skuDir?.nameForSku(c) ?? "",
  });

  // ทุกแถวของ SKU นี้ในไฟล์ ไม่ว่าอยู่บริบทไหน — ถ้าไม่ไล่ข้ามบริบท จะแยกไม่ออก
  // ระหว่าง "ไม่มีในไฟล์" กับ "มีแต่คนละ division/cusgroup" ซึ่งแก้คนละทางกันคนละเรื่อง
  const rowsAnyContext = allRows.filter((r) => r.product === sku);

  const rows = rowsAnyContext.map((r) => {
    const rejectedBy = rejectionOf(r, ctx, region, day);
    return {
      ...describe(r),
      used: rejectedBy === null,
      rejectedBy,
      // ผ่านด่านแล้วแต่ช่วงวันที่ไม่คลุมวันนี้ — ไม่ตีตก (ด่านเป็นรายเดือน) แต่ต้องบอก
      // เพราะเป็นตัวที่ preferInsertedWindow จะไม่เลือกถ้ามีแถวที่ยังวิ่งอยู่
      liveToday: promoActiveOn(r, day),
    };
  });

  const benefitTiers = tiers.filter(isBenefitTier);
  const verdict =
    benefitTiers.length > 0
      ? "มีโปร"
      : rowsAnyContext.length === 0
        ? "ไม่มีแถวของ SKU นี้ในไฟล์เลย — ต้องไปดูที่ต้นทาง C4 หรือ sync ใหม่"
        : rows.every((r) => r.rejectedBy)
          ? `มีแถวในไฟล์ ${rows.length} แถว แต่ถูกตีตกหมด`
          : "มีแถวที่ผ่านด่าน แต่ไม่มีขั้นไหนให้ส่วนลดหรือของแถม";

  return NextResponse.json({
    sku,
    skuName: skuDir?.nameForSku(sku) || null,
    verdict,
    store,
    context: {
      division: ctx.division,
      cusgroup: ctx.cusgroup,
      region: ctx.region,
      isVda: ctx.isVda,
      vdaCode: ctx.vdaCode ?? null,
    },
    file: {
      path: csvPath,
      // ยืนยันว่า process นี้ถือ snapshot รอบไหน — ต่างเครื่องเทียบกันได้ตรงนี้จุดเดียว
      mtime: stat?.mtime.toISOString() ?? null,
      sizeBytes: stat?.size ?? null,
      rowsLoaded: allRows.length,
      contextsInFile: [
        ...new Set(allRows.map((r) => `${r.division}|${r.cusgroup}`)),
      ],
    },
    counts: {
      rowsAnyContext: rowsAnyContext.length,
      rowsInContext: inContext.length,
      candidatesAfterFilters: candidates.length,
      benefitTiers: benefitTiers.length,
    },
    checkedOn: day.toISOString().slice(0, 10),
    tiers,
    rows,
  });
}
