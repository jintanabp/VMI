import type { PromoTierInput } from "@/lib/calculations";
import {
  calcNetUnitPrice,
  formatPremiumUnit,
  isBenefitTier,
} from "@/lib/calculations";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  getAssortedMapping,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
} from "@/lib/fabric";
import { bangkokDateStr, isoDateStr } from "@/lib/fabric/bkk-date";
import { promoServesRegion, type PromoRow } from "@/lib/fabric/promotion-credit";
import { resolvePromoContext } from "@/lib/fabric/promotion-context";
import { normalizeRegion, promoRowsToTiers } from "@/lib/fabric/promotion-lookup";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { buildPromoTitle } from "./promo-title";

/**
 * รายงานโปร C4 ทั้งเดือนสำหรับหน้าแอดมิน
 *
 * ต่างจาก promo-inspector ตรงมุมมอง: inspector ตอบ "ร้านนี้ SKU นี้ วันนี้ได้อะไร"
 * (ผูกกับ context ของร้านและ active รายวัน) ส่วนตัวนี้ตอบ "เดือนนี้ในไฟล์มีโปรอะไรบ้าง"
 * จึงไล่ทุกแถวข้ามทุก division/cusgroup และใช้เกณฑ์ "ทับซ้อนกับเดือน" ไม่ใช่ active วันนี้
 *
 * เหตุที่ต้องมี: ไฟล์ C4 มีแถวจำนวนมากที่ไม่มีสิทธิประโยชน์เลย (from 1 ถึง 9999 ไม่มี
 * ส่วนลด ไม่มีของแถม) ระบบตีตกถูกแล้วแต่ไม่มีที่ไหนให้คนเห็นว่าตีตกเพราะอะไร คำถาม
 * "ทำไมสินค้าตัวนี้ใน CSV มีโปรแต่หน้าจอไม่มี" จึงตอบไม่ได้ถ้าไม่เปิดไฟล์ดูเอง
 */

export type PromoBenefitKind =
  | "discount_baht"
  | "discount_pct"
  | "premium"
  | "none";

export interface PromoMonthSku {
  code: string;
  name: string;
  inSkuMaster: boolean;
  /** ราคาเงินสด/หีบ จาก SKU master (getLookupPrice) — เข้าชุดกับโปร C4 cash */
  unitPrice: number | null;
  /** ส่วนลดของขั้นแรกที่ให้ประโยชน์ (โปรของแถมไม่มีส่วนลด → null) */
  discountBaht: number | null;
  discountPct: number | null;
  /** ราคาหลังหักส่วนลดขั้นแรก — เท่ากับ creditPrice เมื่อเป็นโปรของแถม */
  netPrice: number | null;
}

export interface PromoMonthGroup {
  /** คีย์ไม่ซ้ำในรายงาน — division|cusgroup|group (หรือ |sku เมื่อไม่มีกลุ่ม) */
  key: string;
  division: string;
  cusgroup: string;
  /** รหัส ASSORTEDPRODUCTGROUP — ว่าง = โปรเฉพาะสินค้าตัวเดียว ไม่ได้อยู่กลุ่มไหน */
  group: string;
  /** ชื่อกลุ่มจาก cft_assorted_mapping — ถอยไปใช้รหัสกลุ่ม/ชื่อสินค้าเมื่อไม่มี */
  groupName: string;
  headline: string;
  /** ข้อความเงื่อนไขแบบเดียวกับคอลัมน์ "รายการโปรโมชั่น C4 VDA" ในแบบฟอร์มสั่งสินค้า */
  promoLabel: string;
  skus: PromoMonthSku[];
  tiers: PromoTierInput[];
  kinds: PromoBenefitKind[];
  /** true = มีอย่างน้อยหนึ่งขั้นที่ให้ส่วนลดหรือของแถมจริง */
  hasBenefit: boolean;
  /** ยอดสั่งขั้นต่ำสูงสุดที่ประกาศไว้ในกลุ่ม (0 = ไม่ได้ระบุ) — แสดงอย่างเดียว */
  minPurchase: number;
  fromDate: string;
  toDate: string;
  rowCount: number;
}

export interface PromoMonthReport {
  /** YYYY-MM ตามปฏิทินโซนไทย */
  month: string;
  from: string;
  to: string;
  totals: {
    /** ทุกแถวในไฟล์ที่ sync มา (ก่อนกรองอะไรเลย) */
    rowsInFile: number;
    /** แถวที่ช่วงวันที่ทับซ้อนกับเดือนนี้ */
    rowsInMonth: number;
    /** แถวที่รายงานนี้ใช้จริง = ในเดือน และอยู่ในบริบทที่คลังใช้ */
    rows: number;
    groups: number;
    skus: number;
    noBenefitRows: number;
    skusMissingFromMaster: number;
    /** แถวที่ตัดทิ้งเพราะเป็นบริบทที่ไม่มีคลังไหนใช้ (เช่น division อื่น) */
    rowsOtherContext: number;
  };
  /** บริบทที่รายงานนี้ครอบ — เท่ากับบริบทที่คลังในระบบใช้จริง */
  contexts: { division: string; cusgroup: string; region: string; stores: string[] }[];
  groups: PromoMonthGroup[];
}

/** ต้นเดือน-สิ้นเดือนตามปฏิทินโซนไทย (YYYY-MM-DD) */
export function bangkokMonthRange(day: Date): {
  month: string;
  from: string;
  to: string;
} {
  // ห้ามใช้ toISOString() ที่นี่ — ก่อน 07:00 ICT มันยังเป็นวันก่อนหน้าในโซน UTC
  // ซึ่งต้นเดือน/สิ้นเดือนจะเลื่อนไปทั้งเดือนในวันที่ 1
  const today = bangkokDateStr(day);
  return monthRangeFromMonth(today.slice(0, 7));
}

/** ต้นเดือน-สิ้นเดือนจาก "YYYY-MM" */
function monthRangeFromMonth(month: string): {
  month: string;
  from: string;
  to: string;
} {
  const [y, m] = month.split("-").map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error("BAD_MONTH");
  }
  // Date.UTC(y, m, 0) = วันสุดท้ายของเดือน m (เดือนใน JS เริ่มที่ 0)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    month: `${y}-${mm}`,
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * แถวนี้ใช้ได้ช่วงใดก็ได้ในเดือน (ทับซ้อน) — ไม่ใช่ "เริ่มเดือนนี้" หรือ "active วันนี้"
 * โปรที่คร่อมเดือน เช่น 25 ก.ค.–10 ส.ค. ต้องนับเป็นโปรของทั้งสองเดือน
 */
export function promoOverlapsMonth(
  row: PromoRow,
  from: string,
  to: string
): boolean {
  if (row.fromDate && isoDateStr(row.fromDate) > to) return false;
  if (row.toDate && isoDateStr(row.toDate) < from) return false;
  return true;
}

/**
 * ข้อความเงื่อนไขแบบเดียวกับคอลัมน์ "รายการโปรโมชั่น C4 VDA (Div.E Credit)" ในแบบฟอร์มสั่งสินค้า
 *
 * ไฟล์ C4 เขียนอัตราส่วนเป็น "ต่อ 1 หีบ ได้ N ชิ้น" แล้วประกาศยอดขั้นต่ำแยกไว้ที่
 * MINIMUMPURCHASE ส่วนแบบฟอร์มเขียนรวบเป็น "คละ X หีบ ฟรี ... 1 หีบ" ซึ่งเป็นเรื่อง
 * เดียวกัน — BSWN: ขั้นต่ำ 24 หีบ × 6 ชิ้น = 144 ชิ้น = 1 หีบของ 429001 พอดี
 * ที่นี่จึงคูณกลับให้ตรงกับที่คนอ่านในแบบฟอร์ม แล้วแปลงชิ้น→หีบ เมื่อหารลงตัว
 */
function buildC4Label(tiers: PromoTierInput[], pooled: boolean): string {
  const benefit = tiers
    .filter(isBenefitTier)
    .slice()
    .sort((a, b) => a.minQty - b.minQty);
  if (benefit.length === 0) return "";

  // minQty/premiumQty ที่เข้ามาผ่าน promoRowsToTiers มาแล้ว — เป็นขนาดล็อตและจำนวน
  // ต่อล็อต (แปลงเป็นหีบให้ตอนที่ทำได้) ที่นี่จึงแค่เรียงเป็นประโยคเท่านั้น
  const lead = pooled ? "คละ" : "ซื้อ";
  return benefit
    .map((t) => {
      if (t.kind === "premium" && t.premiumProduct) {
        const unit = formatPremiumUnit(t.premiumUnit ?? "");
        const name = t.premiumName || "";
        return `${lead} ${t.minQty} หีบ ฟรี ${t.premiumProduct} ${name} ${t.premiumQty ?? 0} ${unit}`.replace(
          /\s+/g,
          " "
        );
      }
      if (t.discBaht != null && t.discBaht > 0) {
        return `${lead} ${t.minQty} หีบขึ้นไป ลด ${t.discBaht.toLocaleString("th-TH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} บาท/หีบ`;
      }
      if (t.discPct != null && t.discPct > 0) {
        return `${lead} ${t.minQty} หีบขึ้นไป ลด ${t.discPct}%`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" · ");
}

function kindOf(row: PromoRow): PromoBenefitKind {
  if (
    row.premiumProduct &&
    row.premiumProduct.toUpperCase() !== "NULL" &&
    row.premiumProduct !== "0" &&
    row.premiumQty > 0
  ) {
    return "premium";
  }
  if (row.discAmt > 0) return "discount_baht";
  if (row.discPct > 0) return "discount_pct";
  return "none";
}

/** รายงานของ "เดือนปัจจุบัน" ตามปฏิทินไทย — ไฟล์ C4 อัปเดตเดือนละครั้ง ไม่มีเดือนอื่นให้ดู */
export function buildPromoMonthReport(input?: {
  day?: Date;
}): PromoMonthReport {
  if (!fabricPromoReady()) {
    throw new Error("PROMO_NOT_LOADED");
  }

  const range = bangkokMonthRange(input?.day ?? new Date());

  const promo = getPromotionCreditDirectory();
  const names = getAssortedMapping();
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;

  /**
   * ครอบเฉพาะบริบทที่คลังในระบบใช้จริง (วันนี้คือ Div.E กลุ่มลูกค้า 98)
   *
   * ไฟล์ C4 ที่ sync มามีแถวของ division อื่นปนอยู่ด้วย ซึ่งการ lookup ของหน้าร้าน
   * ไม่มีทางแตะถึงเลย เพราะผูกกับ (division, cusgroup, region) ของร้านนั้น
   * ถ้าเอามาโชว์ทั้งหมด หน้ารายงานจะขัดกับหน้าสต็อก — เห็นโปรในแอดมินแต่ร้านไม่ได้
   * จำนวนที่ตัดทิ้งรายงานไว้ใน totals.rowsOtherContext ไม่ได้หายไปเงียบ ๆ
   */
  const contexts = listStockFromDbSources()
    .map((storeCode) => ({ storeCode, ...resolvePromoContext(storeCode) }))
    .reduce<
      { division: string; cusgroup: string; region: string; stores: string[] }[]
    >((acc, c) => {
      const hit = acc.find(
        (x) =>
          x.division === c.division &&
          x.cusgroup === c.cusgroup &&
          x.region === c.region
      );
      if (hit) hit.stores.push(c.storeCode);
      else
        acc.push({
          division: c.division,
          cusgroup: c.cusgroup,
          region: c.region,
          stores: [c.storeCode],
        });
      return acc;
    }, []);

  const inStoreContext = (r: PromoRow) =>
    contexts.some(
      (c) =>
        c.division === r.division &&
        c.cusgroup === r.cusgroup &&
        promoServesRegion(r, normalizeRegion(c.region))
    );

  const allRows = promo.allRows();
  const inMonth = allRows.filter((r) =>
    promoOverlapsMonth(r, range.from, range.to)
  );
  // ไม่มีคลังในระบบเลย (stock cover ยังไม่โหลด) → ไม่กรอง ดีกว่าโชว์หน้าว่างโดยไม่บอกอะไร
  const rows = contexts.length > 0 ? inMonth.filter(inStoreContext) : inMonth;
  const rowsOtherContext = inMonth.length - rows.length;

  const buckets = new Map<string, PromoRow[]>();
  for (const r of rows) {
    const group = (r.raw.ASSORTEDPRODUCTGROUP ?? "").trim();
    // ไม่มีกลุ่ม = โปรของ SKU ตัวเดียว แยกถังของตัวเองไป ไม่ควรถูกยุบรวมกับตัวอื่น
    const key = group
      ? `${r.division}|${r.cusgroup}|${group}`
      : `${r.division}|${r.cusgroup}|#${r.product}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(r);
    buckets.set(key, bucket);
  }

  const missingSkus = new Set<string>();
  let noBenefitRows = 0;
  const allSkus = new Set<string>();

  const groups: PromoMonthGroup[] = [];
  for (const [key, bucket] of buckets) {
    const first = bucket[0]!;
    const group = (first.raw.ASSORTEDPRODUCTGROUP ?? "").trim();

    const kinds = [...new Set(bucket.map(kindOf))];
    for (const r of bucket) if (kindOf(r) === "none") noBenefitRows++;

    const tiers = promoRowsToTiers(bucket, {
      packSizeOf: (c) => skuDir?.packSizeForSku(c) ?? 1,
      nameOf: (c) => skuDir?.nameForSku(c) ?? "",
    });
    const hasBenefit = tiers.some(isBenefitTier);
    const minPurchase = bucket.reduce(
      (max, r) => Math.max(max, r.minPurchase),
      0
    );

    // ขั้นแรกที่ให้ประโยชน์ = ขั้นที่ร้านเอื้อมถึงก่อน ใช้เป็นคอลัมน์ส่วนลด/ราคาในมุมมองใบสั่งซื้อ
    const entryTier =
      tiers.filter(isBenefitTier).sort((a, b) => a.minQty - b.minQty)[0] ?? null;
    const discountBaht =
      entryTier?.discBaht != null && entryTier.discBaht > 0
        ? entryTier.discBaht
        : null;
    const discountPct =
      !discountBaht && entryTier?.discPct != null && entryTier.discPct > 0
        ? entryTier.discPct
        : null;

    const skuCodes = [...new Set(bucket.map((r) => r.product))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const skus: PromoMonthSku[] = skuCodes.map((code) => {
      const name = skuDir?.nameForSku(code) ?? "";
      allSkus.add(code);
      // ไม่มีใน SKU master = ต่อให้มีโปรก็ไม่มีแถวให้แสดงในหน้าสต็อก
      // นี่เป็นสาเหตุหนึ่งของ "CSV มีโปรแต่ระบบไม่มี" ที่ต้องแยกให้เห็น
      if (!name) missingSkus.add(code);
      const unitPrice = skuDir?.getLookupPrice(code).price ?? null;
      return {
        code,
        name: name || code,
        inSkuMaster: Boolean(name),
        unitPrice,
        discountBaht,
        discountPct,
        netPrice: calcNetUnitPrice(unitPrice, discountBaht, discountPct),
      };
    });

    const fromDates = bucket
      .map((r) => (r.raw.FROMDATE ?? "").slice(0, 10))
      .filter(Boolean)
      .sort();
    const toDates = bucket
      .map((r) => (r.raw.TODATE ?? "").slice(0, 10))
      .filter(Boolean)
      .sort();

    const groupName = group ? names.labelFor(group) : skus[0]?.name || "";
    const { headline } = buildPromoTitle({
      group: group || null,
      groupName,
      tiers,
      memberCount: skus.length,
    });

    groups.push({
      key,
      division: first.division,
      cusgroup: first.cusgroup,
      group,
      groupName,
      headline,
      promoLabel: buildC4Label(tiers, skus.length > 1),
      skus,
      tiers,
      kinds,
      hasBenefit,
      minPurchase,
      fromDate: fromDates[0] ?? "",
      toDate: toDates[toDates.length - 1] ?? "",
      rowCount: bucket.length,
    });
  }

  // กลุ่มที่ให้ประโยชน์จริงขึ้นก่อน แล้วเรียงตามจำนวน SKU — กลุ่มใหญ่คือกลุ่มที่คนถามถึง
  groups.sort((a, b) => {
    if (a.hasBenefit !== b.hasBenefit) return a.hasBenefit ? -1 : 1;
    if (a.skus.length !== b.skus.length) return b.skus.length - a.skus.length;
    return a.groupName.localeCompare(b.groupName, "th");
  });

  return {
    ...range,
    totals: {
      rowsInFile: allRows.length,
      rowsInMonth: inMonth.length,
      rows: rows.length,
      groups: groups.length,
      skus: allSkus.size,
      noBenefitRows,
      skusMissingFromMaster: missingSkus.size,
      rowsOtherContext,
    },
    contexts,
    groups,
  };
}
