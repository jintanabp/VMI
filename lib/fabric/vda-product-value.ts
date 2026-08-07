import fs from "fs";
import { readCsvFile } from "./csv";
import { getVdaProductCsvPath } from "./paths";
import { normalizeStoreKey } from "./store-key";
import { getVdaKeys } from "./vda-aos-bill";

/**
 * มูลค่าสต็อกจริงต่อสินค้าต่อ VDA — จาก vda{N}_product_product.csv (Odoo product.product)
 *
 * เดิมหน้าสต็อกคิด "มูลค่ารวม" จาก คงเหลือ × ราคาขาย (CreditPrice) ซึ่งไม่ใช่เงินที่
 * ร้าน VDA จ่ายไปจริง ไฟล์นี้มี bi_stock_value ที่เป็น **มูลค่ารวมของสินค้านั้นอยู่แล้ว**
 * ไม่ใช่ราคาต่อหน่วย — ยืนยันจากข้อมูลจริงที่มี bi_qty_available มาคู่กัน
 * (เช่น qty 28 → value 3,052 = 109 บาท/ชิ้น) จึงต้องบวกตรง ๆ ห้ามคูณคงเหลือซ้ำ
 *
 * ไฟล์อยู่ lakehouse เดียวกับ stock_cover_day ไม่ใช่ตัวที่ vda*_aos_bill ใช้
 *
 * VDA ที่ยังไม่ได้เพิ่มสองคอลัมน์นี้จะโหลดไฟล์ผ่าน แต่ถือว่า "ไม่มีต้นทุน" —
 * ปลายทางต้องถอยไปใช้ราคาขายและบอกผู้ใช้ว่าถอย (ตอนเขียนมีแต่ vda1 ที่มีข้อมูล)
 */

const CODE_COLUMNS = ["default_code", "defaultcode", "productcode", "product_code"];
const VALUE_COLUMNS = ["bi_stock_value", "stock_value"];

function normVda(code: string): string {
  return normalizeStoreKey(code);
}

function pickColumn(headers: string[], candidates: string[]): string | null {
  const lower = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  for (const c of candidates) {
    const hit = lower.get(c);
    if (hit) return hit;
  }
  return null;
}

export class VdaProductValueRegistry {
  private byVda = new Map<string, Map<string, number>>();
  /** VDA ที่ไฟล์มีคอลัมน์มูลค่าจริง — ต่างจาก "โหลดไฟล์ได้แต่ไม่มีคอลัมน์" */
  private vdasWithValue = new Set<string>();

  clear() {
    this.byVda.clear();
    this.vdasWithValue.clear();
  }

  loadCsv(vdaKey: string, csvPath: string): boolean {
    if (!fs.existsSync(csvPath)) return false;

    const vda = normVda(vdaKey);
    const { headers, rows } = readCsvFile(csvPath);
    const codeCol = pickColumn(headers, CODE_COLUMNS);
    const valueCol = pickColumn(headers, VALUE_COLUMNS);

    if (!codeCol) {
      console.warn(`[VdaProductValue] ${csvPath}: ไม่มีคอลัมน์รหัสสินค้า`);
      return false;
    }
    if (!valueCol) {
      // ปกติสำหรับ VDA ที่ยังไม่ได้เพิ่ม bi_stock_value ใน export — ไม่ใช่ error
      console.info(
        `[VdaProductValue] ${vda}: ยังไม่มีคอลัมน์มูลค่า (${VALUE_COLUMNS.join("/")}) — จะถอยไปใช้ราคาขาย`
      );
      return false;
    }

    const map = new Map<string, number>();
    for (const row of rows) {
      const code = (row[codeCol] ?? "").trim();
      if (!code) continue;
      const raw = (row[valueCol] ?? "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      // รหัสซ้ำ (variant ของ template เดียวกัน) = คนละแถวสต็อก → บวกรวม ไม่ทับกัน
      map.set(code, (map.get(code) ?? 0) + value);
    }

    this.byVda.set(vda, map);
    this.vdasWithValue.add(vda);

    const nonZero = [...map.values()].filter((v) => v !== 0).length;
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    console.info(
      `[VdaProductValue] ${vda} ← ${map.size} รหัส (${nonZero} ตัวมีมูลค่า รวม ${total.toFixed(2)} บาท) from ${csvPath}`
    );
    return true;
  }

  /** ไฟล์ของ VDA นี้มีคอลัมน์มูลค่าให้ใช้จริงหรือไม่ */
  hasValuesFor(vdaCode: string): boolean {
    return this.vdasWithValue.has(normVda(vdaCode));
  }

  /** มูลค่าสต็อกของสินค้านั้น (บาท) — null = ไม่มีข้อมูล ให้ผู้เรียกถอยไปใช้ราคาขาย
   *  0 ที่มีอยู่จริงในไฟล์ ≠ null — ของหมดคลังต้องนับเป็น 0 ไม่ใช่ตีกลับไปคิดราคาขาย */
  getStockValue(vdaCode: string, productCode: string): number | null {
    const map = this.byVda.get(normVda(vdaCode));
    if (!map) return null;
    return map.get(productCode.trim()) ?? null;
  }

  listVdasWithValue(): string[] {
    return [...this.vdasWithValue].sort();
  }
}

let registry: VdaProductValueRegistry | null = null;

export function getVdaProductValueRegistry(): VdaProductValueRegistry {
  if (!registry) reloadVdaProductValueRegistry();
  return registry!;
}

export function reloadVdaProductValueRegistry(): void {
  registry = new VdaProductValueRegistry();
  for (const vda of getVdaKeys()) {
    registry.loadCsv(vda, getVdaProductCsvPath(vda));
  }
}
