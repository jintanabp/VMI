import fs from "fs";
import { streamCsvFile } from "./csv";
import { getCrossTargetCsvPath } from "./paths";

/**
 * เป้าขายเดือนปัจจุบันต่อพนักงานขาย — จาก cross_target_current_month.csv
 *
 * ใช้ตอบคำถามเดียว: "สินค้าที่ร้านนี้ควรมีขายเดือนนี้ มีอะไรบ้าง"
 * เพราะหน้าสต็อกสร้างแถวจาก stock_cover_day เท่านั้น สินค้าที่เพิ่งออกใหม่และ
 * ร้านยังไม่เคยสต็อกจึงไม่มีแถวให้กด — ร้านอยากสั่งก็สั่งไม่ได้
 *
 * ไฟล์อยู่ lakehouse เดียวกับตาราง C4 (CFT_*) และมี 11 คอลัมน์:
 *   SalesType, SalesManCode, ProductCode, WarehouseCode, Quantity, Amount,
 *   DYear, DQuarter, DMonth, DDay, UpdateDate
 *
 * **ไม่มีชื่อสินค้าในไฟล์** — ชื่อมาจาก item_barcode_map_v2 (SkuMasterDirectory)
 * รหัสที่ sku master ไม่รู้จักจะถูกทิ้ง เพราะแสดงเป็นแถวสั่งซื้อไม่ได้อยู่ดี
 *
 * WarehouseCode คือรหัสลูกค้าของร้าน (บางแถวมี prefix เช่น G004 + รหัส) จึงเก็บ
 * ทั้งดัชนีตามรหัสเซลล์และตามรหัสลูกค้า ให้ผู้เรียกเลือกใช้ได้
 */

const SALESMAN_COLUMNS = ["salesmancode", "salesman_code", "salesman"];
const PRODUCT_COLUMNS = ["productcode", "product_code", "product"];
const WAREHOUSE_COLUMNS = ["warehousecode", "warehouse_code", "warehouse"];

function pick(headers: string[], candidates: string[]): string | null {
  const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
  for (const c of candidates) if (lower.has(c)) return c;
  return null;
}

function normCode(code: string): string {
  return code.trim().toUpperCase();
}

/** ตัดศูนย์นำหน้าเพื่อเทียบรหัสลูกค้าที่ต้นทางเขียนไม่เท่ากัน (0025409 vs 25409) */
function normCustomer(code: string): string {
  return code.trim().replace(/^0+/, "") || "0";
}

/**
 * ดึงรหัสลูกค้าออกจาก WarehouseCode
 *
 * ต้นทางเขียนสองแบบ: รหัสลูกค้าตรง ๆ ("5042814") หรือมี prefix คลัง 4 ตัวนำหน้า
 * ("G0043231847" = G004 + 3231847, "G0105050974" = G010 + 5050974)
 *
 * จับด้วย pattern ไม่ใช่ endsWith เพราะ endsWith จะแมตช์ผิดข้ามร้านได้ง่าย —
 * รหัสลูกค้า 7 หลักที่ลงท้ายเหมือนกันมีจริงในไฟล์
 */
function customerKeyFromWarehouse(wh: string): string {
  const code = wh.trim().toUpperCase();
  const m = /^[A-Z]\d{3}(\d{7})$/.exec(code);
  return normCustomer(m ? m[1]! : code);
}

export class CrossTargetRegistry {
  private bySalesman = new Map<string, Set<string>>();
  private byCustomer = new Map<string, Set<string>>();
  /** รหัสลูกค้า → รหัสเซลล์ที่ดูแล (พร้อมจำนวนแถว ใช้เรียงว่าใครเป็นตัวหลัก) */
  private salesmenByCustomer = new Map<string, Map<string, number>>();
  private rowCount = 0;

  get isLoaded() {
    return this.bySalesman.size > 0;
  }

  get rows() {
    return this.rowCount;
  }

  clear() {
    this.bySalesman.clear();
    this.byCustomer.clear();
    this.salesmenByCustomer.clear();
    this.rowCount = 0;
  }

  load(csvPath: string): boolean {
    this.clear();
    if (!fs.existsSync(csvPath)) return false;

    let smCol: string | null = null;
    let pcCol: string | null = null;
    let whCol: string | null = null;
    let picked = false;

    const { headers, rowCount } = streamCsvFile(csvPath, (row) => {
      if (!picked) {
        // streamCsvFile ทำ key เป็นตัวพิมพ์เล็กให้แล้ว — เลือกคอลัมน์จากแถวแรกครั้งเดียว
        const keys = Object.keys(row);
        smCol = pick(keys, SALESMAN_COLUMNS);
        pcCol = pick(keys, PRODUCT_COLUMNS);
        whCol = pick(keys, WAREHOUSE_COLUMNS);
        picked = true;
      }
      if (!smCol || !pcCol) return;
      const product = (row[pcCol] ?? "").trim();
      // ของแถมขึ้นต้นด้วย 0 เหมือนหน้าสต็อก — ไม่ใช่ของที่ร้านสั่งเอง
      if (!product || product.startsWith("0")) return;

      const sm = normCode(row[smCol] ?? "");
      if (sm) {
        if (!this.bySalesman.has(sm)) this.bySalesman.set(sm, new Set());
        this.bySalesman.get(sm)!.add(product);
      }
      if (whCol) {
        const wh = customerKeyFromWarehouse(row[whCol] ?? "");
        if (wh && wh !== "0") {
          if (!this.byCustomer.has(wh)) this.byCustomer.set(wh, new Set());
          this.byCustomer.get(wh)!.add(product);
          if (sm) {
            if (!this.salesmenByCustomer.has(wh)) {
              this.salesmenByCustomer.set(wh, new Map());
            }
            const bucket = this.salesmenByCustomer.get(wh)!;
            bucket.set(sm, (bucket.get(sm) ?? 0) + 1);
          }
        }
      }
      this.rowCount++;
    });

    if (!smCol || !pcCol) {
      console.warn(
        `[CrossTarget] ${csvPath}: ไม่มีคอลัมน์ ${SALESMAN_COLUMNS[0]}/${PRODUCT_COLUMNS[0]} — header ที่พบ: ${headers.join(", ")}`
      );
      this.clear();
      return false;
    }

    console.info(
      `[CrossTarget] Loaded ${rowCount} rows · ${this.bySalesman.size} เซลล์ · ${this.byCustomer.size} รหัสลูกค้า from ${csvPath}`
    );
    return this.isLoaded;
  }

  /** รหัสสินค้าที่อยู่ในเป้าของพนักงานขายคนนี้ (รวมหลายรหัสได้) */
  productsForSalesmen(codes: string[]): string[] {
    const out = new Set<string>();
    for (const c of codes) {
      for (const p of this.bySalesman.get(normCode(c)) ?? []) out.add(p);
    }
    return [...out];
  }

  /** รหัสสินค้าตามรหัสลูกค้า (WarehouseCode) — ตรงตัวร้านกว่ารหัสเซลล์ */
  productsForCustomers(codes: string[]): string[] {
    const out = new Set<string>();
    for (const c of codes) {
      for (const p of this.byCustomer.get(normCustomer(c)) ?? []) out.add(p);
    }
    return [...out];
  }

  /**
   * รหัสเซลล์ที่ดูแลรหัสลูกค้าเหล่านี้ — เรียงจากคนที่มีแถวมากสุด (ตัวหลัก) ก่อน
   *
   * นี่คือแหล่งความจริงของ "เซลล์คนไหนดูแล VDA ไหน" แทนการกรอกมือใน .env
   * ซึ่งเคยผิดเพราะเซลล์คนเดียวดูแลได้หลายคลัง (S091 ดูแลทั้ง vda1 และ vda3)
   */
  salesmenForCustomers(codes: string[]): string[] {
    const totals = new Map<string, number>();
    for (const c of codes) {
      const bucket = this.salesmenByCustomer.get(normCustomer(c));
      if (!bucket) continue;
      for (const [sm, n] of bucket) totals.set(sm, (totals.get(sm) ?? 0) + n);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sm]) => sm);
  }

  listSalesmanCodes(): string[] {
    return [...this.bySalesman.keys()].sort();
  }
}

let registry: CrossTargetRegistry | null = null;

export function getCrossTargetRegistry(): CrossTargetRegistry {
  if (!registry) reloadCrossTargetRegistry();
  return registry!;
}

export function reloadCrossTargetRegistry(): void {
  registry = new CrossTargetRegistry();
  /**
   * ห้ามโยน exception ออกไป — ตัวนี้ถูกเรียกใน reloadFabricMasters() ซึ่งทุก request
   * วิ่งผ่าน ensureFabricMastersFresh() ถ้าอ่านไฟล์ไม่ได้ (ดิสก์เต็ม สิทธิ์ไฟล์
   * ไฟล์เสีย ฯลฯ) แล้วปล่อยให้ throw จะกลายเป็น 500 ทั้งเว็บ ทั้งที่ชุดข้อมูลนี้
   * required: false — ขาดได้ แค่แท็บ "ควรมีขาย" ว่างเท่านั้น
   */
  try {
    registry.load(getCrossTargetCsvPath());
  } catch (err) {
    console.error(
      `[CrossTarget] โหลดไม่สำเร็จ — แท็บ "ควรมีขาย" จะว่าง ส่วนอื่นทำงานปกติ:`,
      err
    );
    registry.clear();
  }
}
