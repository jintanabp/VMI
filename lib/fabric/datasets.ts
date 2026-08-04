import fs from "fs";
import path from "path";
import { countCsvRows } from "./csv";
import { getMinRows } from "./env";
import {
  bootstrapIfMissing,
  buildAssortedMappingSpec,
  buildCustomerSpec,
  buildPromotionCreditSpec,
  buildSalesmanSpec,
  buildSkuMasterSpec,
  buildSoldHistorySpec,
  buildStockCoverSpec,
  buildVdaAosSpec,
  type DatasetRefreshResult,
  type RefreshSpec,
} from "./onelake-refresh";
import {
  getAssortedMappingCsvPath,
  getCustomerCsvPath,
  getPromotionCsvPath,
  getSalesmanCsvPath,
  getSkuMasterCsvPath,
  getSoldHistoryCsvPath,
  getStockCoverCsvPath,
  getVdaAosCsvPath,
} from "./paths";
import { getVdaKeys } from "./vda-aos-bill";

/**
 * แหล่งความจริงเดียวของชุดข้อมูลที่ระบบดึงจาก OneLake
 *
 * ก่อนหน้านี้รายชื่อไฟล์กระจายอยู่ 4 ที่ (refreshAllMasters, scheduler,
 * scripts/sync-fabric-masters, app/api/stock/refresh) และ getCacheFileAges()
 * ครอบแค่ 5 จาก 12 ไฟล์ — ตก factsales_odoo.csv และ vda*_aos_bill.csv ทั้งหมด
 * ทำให้หน้าแอดมินรายงานไม่ครบโดยไม่มีใครสังเกต
 */

/** vda* เป็น dynamic (ตาม VDA_KEYS) จึงไม่อยู่ใน literal นี้ */
export const CORE_DATASET_IDS = [
  "customer_master",
  "salesman_registry",
  "stock_cover_day",
  "promotion_c4",
  "assorted_mapping",
  "sku_master",
  "factsales_odoo",
] as const;

export type CoreDatasetId = (typeof CORE_DATASET_IDS)[number];
/** vda1_aos_bill … — ตรวจด้วย isDatasetId() ไม่ใช่ literal union */
export type DatasetId = CoreDatasetId | (string & {});

export interface DatasetMeta {
  id: DatasetId;
  label: string;
  localPath: string;
  minRows: number;
  minRowsEnv: string;
  /** false = ล้มเหลวได้โดยไม่ถือว่ารอบ refresh ทั้งรอบพัง */
  required: boolean;
}

function vdaDatasetId(vdaKey: string): string {
  return `${vdaKey.trim().toLowerCase()}_aos_bill`;
}

export function getDatasetIds(): DatasetId[] {
  return [...CORE_DATASET_IDS, ...getVdaKeys().map(vdaDatasetId)];
}

export function isDatasetId(v: unknown): v is DatasetId {
  return typeof v === "string" && getDatasetIds().includes(v);
}

export function datasetMeta(id: DatasetId): DatasetMeta | null {
  const min = getMinRows();
  switch (id) {
    case "customer_master":
      return {
        id,
        label: "ลูกค้า (dim_customer)",
        localPath: getCustomerCsvPath(),
        minRows: min.customer,
        minRowsEnv: "CUSTOMER_MIN_ROWS",
        required: true,
      };
    case "salesman_registry":
      return {
        id,
        label: "พนักงานขาย (cross_salesman_reference_email)",
        localPath: getSalesmanCsvPath(),
        minRows: min.salesman,
        minRowsEnv: "SALESMAN_MIN_ROWS",
        required: true,
      };
    case "stock_cover_day":
      return {
        id,
        label: "สต็อก + ยอดขายเฉลี่ย (stock_cover_day)",
        localPath: getStockCoverCsvPath(),
        minRows: min.stockCover,
        minRowsEnv: "STOCK_COVER_MIN_ROWS",
        required: true,
      };
    case "promotion_c4":
      return {
        id,
        label: "โปรโมชั่น C4 (cft_promotion)",
        localPath: getPromotionCsvPath(),
        minRows: min.promotion,
        minRowsEnv: "CFT_MIN_ROWS",
        required: true,
      };
    case "assorted_mapping":
      return {
        id,
        label: "ชื่อกลุ่มโปรโมชั่น (cft_assorted_mapping)",
        localPath: getAssortedMappingCsvPath(),
        minRows: Number(process.env.ASSORTED_MIN_ROWS ?? "50"),
        minRowsEnv: "ASSORTED_MIN_ROWS",
        // ขาดได้ — UI ถอยไปแสดงรหัสกลุ่มแทนชื่อ ไม่ทำให้โปรพัง
        required: false,
      };
    case "sku_master":
      return {
        id,
        label: "สินค้า + ราคา + บาร์โค้ด (item_barcode_map_v2)",
        localPath: getSkuMasterCsvPath(),
        minRows: min.skuMaster,
        minRowsEnv: "SKU_MIN_ROWS",
        required: true,
      };
    case "factsales_odoo":
      return {
        id,
        label: "ยอดขายรายวัน (factsales_odoo)",
        localPath: getSoldHistoryCsvPath(),
        minRows: Number(process.env.SOLD_HISTORY_MIN_ROWS ?? "1"),
        minRowsEnv: "SOLD_HISTORY_MIN_ROWS",
        required: false,
      };
    default: {
      const vda = getVdaKeys().find((k) => vdaDatasetId(k) === id);
      if (!vda) return null;
      return {
        id,
        label: `บิล AOS ${vda.toUpperCase()} (${id})`,
        localPath: getVdaAosCsvPath(vda),
        minRows: Number(process.env.VDA_AOS_MIN_ROWS ?? "1"),
        minRowsEnv: "VDA_AOS_MIN_ROWS",
        required: false,
      };
    }
  }
}

export function buildSpecFor(id: DatasetId): RefreshSpec | null {
  const meta = datasetMeta(id);
  if (!meta) return null;
  switch (id) {
    case "customer_master":
      return buildCustomerSpec(meta.localPath);
    case "salesman_registry":
      return buildSalesmanSpec(meta.localPath);
    case "stock_cover_day":
      return buildStockCoverSpec(meta.localPath);
    case "promotion_c4":
      return buildPromotionCreditSpec(meta.localPath);
    case "assorted_mapping":
      return buildAssortedMappingSpec(meta.localPath);
    case "sku_master":
      return buildSkuMasterSpec(meta.localPath);
    case "factsales_odoo":
      return buildSoldHistorySpec(meta.localPath);
    default: {
      const vda = getVdaKeys().find((k) => vdaDatasetId(k) === id);
      return vda ? buildVdaAosSpec(vda, meta.localPath) : null;
    }
  }
}

export interface DatasetInventoryRow {
  id: DatasetId;
  label: string;
  localPath: string;
  fileName: string;
  /** ตั้ง env ครบพอจะดึงจาก OneLake ได้ */
  configured: boolean;
  exists: boolean;
  bytes: number | null;
  rows: number | null;
  mtime: string | null;
  ageHours: number | null;
  minRows: number;
  minRowsEnv: string;
  required: boolean;
}

/**
 * นับแถวแพงมากสำหรับ item_barcode_map_v2.csv (68MB) — cache ตาม mtime
 * ปกติจำนวนแถวมาจาก status ที่เขียนไว้ตอน sync (ได้มาฟรี) จึง countRows=false เป็น default
 */
const rowCountCache = new Map<string, number>();

function cachedRowCount(filePath: string, mtimeMs: number): number | null {
  const key = `${filePath}:${mtimeMs}`;
  const hit = rowCountCache.get(key);
  if (hit != null) return hit;
  try {
    const n = countCsvRows(filePath);
    rowCountCache.set(key, n);
    return n;
  } catch {
    return null;
  }
}

export function getDatasetInventory(opts?: {
  countRows?: boolean;
}): DatasetInventoryRow[] {
  const now = Date.now();
  const rows: DatasetInventoryRow[] = [];

  for (const id of getDatasetIds()) {
    const meta = datasetMeta(id);
    if (!meta) continue;

    let exists = false;
    let bytes: number | null = null;
    let mtime: string | null = null;
    let ageHours: number | null = null;
    let rowCount: number | null = null;

    try {
      const stat = fs.statSync(meta.localPath);
      exists = true;
      bytes = stat.size;
      mtime = stat.mtime.toISOString();
      ageHours = Math.round(((now - stat.mtimeMs) / 3_600_000) * 10) / 10;
      if (opts?.countRows) {
        rowCount = cachedRowCount(meta.localPath, stat.mtimeMs);
      }
    } catch {
      // ไฟล์ยังไม่มี — ปล่อยค่า null ไว้ให้ UI แสดงว่ายังไม่เคยโหลด
    }

    rows.push({
      id,
      label: meta.label,
      localPath: meta.localPath,
      fileName: path.basename(meta.localPath),
      configured: buildSpecFor(id) != null,
      exists,
      bytes,
      rows: rowCount,
      mtime,
      ageHours,
      minRows: meta.minRows,
      minRowsEnv: meta.minRowsEnv,
      required: meta.required,
    });
  }

  return rows;
}

/**
 * ดึงไฟล์ที่ยังไม่มีในเครื่อง — คอนเทนเนอร์ใหม่ boot มาโดยไม่มี CSV เลย
 * เดิม bootstrapIfMissing เรียกได้จาก scripts/sync-fabric-masters.ts ทางเดียว
 * ทำให้เซิร์ฟเวอร์ที่เพิ่ง deploy พังค้างจนมีคนเข้าไปสั่ง sync เอง
 */
export async function bootstrapMissingMasters(): Promise<DatasetRefreshResult[]> {
  const results: DatasetRefreshResult[] = [];
  for (const id of getDatasetIds()) {
    const res = await bootstrapIfMissing(buildSpecFor(id));
    if (res) results.push(res);
  }
  return results;
}
