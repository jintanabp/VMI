import fs from "fs";
import { CustomerDirectory } from "./customer-directory";
import { reloadStockCover } from "./stock-cover";
import {
  getCustomerCsvPath,
  getPromotionCsvPath,
  getSalesmanCsvPath,
  getSkuMasterCsvPath,
  getSoldHistoryCsvPath,
  getStockCoverCsvPath,
} from "./paths";
import { PromotionCredit } from "./promotion-credit";
import { SalesmanRegistry } from "./salesman-registry";
import { SkuMasterDirectory } from "./sku-master";
import { SoldHistoryDirectory } from "./sold-history";
import { reloadVdaAosBillRegistry } from "./vda-aos-bill";
import { fabricMastersEnabled } from "./env";

let customerDir: CustomerDirectory | null = null;
let salesmanReg: SalesmanRegistry | null = null;
let promoCredit: PromotionCredit | null = null;
let skuMaster: SkuMasterDirectory | null = null;
let soldHistory: SoldHistoryDirectory | null = null;

const fabricCacheMtimes = new Map<string, number>();

function csvMtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function trackedFabricPaths(): string[] {
  return [
    getCustomerCsvPath(),
    getSalesmanCsvPath(),
    getPromotionCsvPath(),
    getSkuMasterCsvPath(),
    getSoldHistoryCsvPath(),
    getStockCoverCsvPath(),
  ];
}

/** ลายเซ็นของไฟล์ CSV master ทั้งหมด (mtime) — เปลี่ยนเมื่อมี sync ข้อมูลใหม่ */
export function fabricMastersMtimeSignature(): string {
  return trackedFabricPaths()
    .map((p) => csvMtime(p) ?? 0)
    .join("|");
}

function primeMtimes(paths: string[]): void {
  fabricCacheMtimes.clear();
  for (const p of paths) {
    const mtime = csvMtime(p);
    if (mtime != null) fabricCacheMtimes.set(p, mtime);
  }
}

/** มี master ตัวหลักถูกโหลดแล้วหรือไม่ (จาก preload ตอน boot หรือ lazy getter) */
function anyMasterLoaded(): boolean {
  return (
    (customerDir?.isLoaded ?? false) ||
    (skuMaster?.isLoaded ?? false) ||
    (soldHistory?.isLoaded ?? false)
  );
}

/** โหลด cache ใหม่เมื่อไฟล์ CSV บนดิสก์เปลี่ยน (แก้ stale ข้าม worker / หลัง sync) */
export function ensureFabricMastersFresh(): void {
  const paths = trackedFabricPaths();

  // ครั้งแรก (ยังไม่เคย track mtime)
  if (fabricCacheMtimes.size === 0) {
    // ถ้ามี master ถูกโหลดไว้แล้ว (preload ตอน boot หรือ lazy getter) → แค่ prime mtime
    // ไม่ต้อง reloadFabricMasters ซ้ำ (กัน parse ไฟล์ 68MB บน request แรก)
    if (anyMasterLoaded()) {
      primeMtimes(paths);
      return;
    }
    // ยังไม่มีอะไรโหลดเลย → โหลดครั้งแรก (reload จะ prime mtime ให้เอง)
    reloadFabricMasters();
    return;
  }

  // ครั้งถัดไป: reload เฉพาะเมื่อไฟล์เปลี่ยน (หลัง sync)
  for (const p of paths) {
    const mtime = csvMtime(p);
    if (mtime == null) continue;
    if (fabricCacheMtimes.get(p) !== mtime) {
      reloadFabricMasters();
      return;
    }
  }
}

function shouldLoadSkuMaster() {
  if (!fabricMastersEnabled()) return false;
  const path = getSkuMasterCsvPath();
  return fs.existsSync(path) && fs.statSync(path).size > 100;
}

function shouldLoadSoldHistory() {
  if (!fabricMastersEnabled()) return false;
  const path = getSoldHistoryCsvPath();
  return fs.existsSync(path) && fs.statSync(path).size > 100;
}

function shouldLoadMasters() {
  if (!fabricMastersEnabled()) return false;
  const customerPath = getCustomerCsvPath();
  return fs.existsSync(customerPath) && fs.statSync(customerPath).size > 100;
}

function shouldLoadPromotion() {
  if (!fabricMastersEnabled()) return false;
  const path = getPromotionCsvPath();
  return fs.existsSync(path) && fs.statSync(path).size > 100;
}

export function getCustomerDirectory(): CustomerDirectory {
  if (!customerDir) {
    customerDir = new CustomerDirectory();
    if (shouldLoadMasters()) {
      customerDir.load(getCustomerCsvPath());
    }
  }
  return customerDir;
}

export function getSalesmanRegistry(): SalesmanRegistry {
  if (!salesmanReg) {
    salesmanReg = new SalesmanRegistry();
    const path = getSalesmanCsvPath();
    if (fs.existsSync(path) && fs.statSync(path).size > 100) {
      salesmanReg.load(path);
    }
  }
  return salesmanReg;
}

export function getPromotionCreditDirectory(): PromotionCredit {
  if (!promoCredit) {
    promoCredit = new PromotionCredit();
    if (shouldLoadPromotion()) {
      promoCredit.load(getPromotionCsvPath());
    }
  }
  return promoCredit;
}

export function getSkuMasterDirectory(): SkuMasterDirectory {
  if (!skuMaster) {
    skuMaster = new SkuMasterDirectory();
    if (shouldLoadSkuMaster()) {
      skuMaster.load(getSkuMasterCsvPath());
    }
  }
  return skuMaster;
}

export function getSoldHistoryDirectory(): SoldHistoryDirectory {
  if (!soldHistory) {
    soldHistory = new SoldHistoryDirectory();
    if (shouldLoadSoldHistory()) {
      soldHistory.load(getSoldHistoryCsvPath());
    }
  }
  return soldHistory;
}

export function fabricSoldHistoryReady(): boolean {
  return shouldLoadSoldHistory() && getSoldHistoryDirectory().isLoaded;
}

export function reloadFabricMasters(): void {
  customerDir = new CustomerDirectory();
  salesmanReg = new SalesmanRegistry();
  promoCredit = new PromotionCredit();
  skuMaster = new SkuMasterDirectory();
  soldHistory = new SoldHistoryDirectory();
  if (shouldLoadMasters()) {
    customerDir.load(getCustomerCsvPath());
  }
  const salesmanPath = getSalesmanCsvPath();
  if (fs.existsSync(salesmanPath)) {
    salesmanReg.load(salesmanPath);
  }
  if (shouldLoadPromotion()) {
    promoCredit.load(getPromotionCsvPath());
  }
  if (shouldLoadSkuMaster()) {
    skuMaster.load(getSkuMasterCsvPath());
  }
  if (shouldLoadSoldHistory()) {
    soldHistory.load(getSoldHistoryCsvPath());
  }
  reloadStockCover();
  reloadVdaAosBillRegistry();
  fabricCacheMtimes.clear();
  for (const p of trackedFabricPaths()) {
    const mtime = csvMtime(p);
    if (mtime != null) fabricCacheMtimes.set(p, mtime);
  }
}

/** โหลด master ทั้งหมดล่วงหน้าตอน boot (นอก request path)
 *  reloadFabricMasters() จะ prime ทั้ง directory และ fabricCacheMtimes ให้
 *  → request แรกที่เรียก ensureFabricMastersFresh() จะเห็น "ไม่ stale" แล้วข้าม reload
 *  (กัน request แรก/หลัง sync ต้อง parse ไฟล์ SKU 68MB แบบ sync บน request thread) */
export function warmFabricMasters(): void {
  if (!fabricMastersEnabled()) return;
  reloadFabricMasters();
}

export function fabricMastersReady(): boolean {
  return shouldLoadMasters() && getCustomerDirectory().isLoaded;
}

export function fabricPromoReady(): boolean {
  return shouldLoadPromotion() && getPromotionCreditDirectory().isLoaded;
}

export function fabricSkuMasterReady(): boolean {
  return shouldLoadSkuMaster() && getSkuMasterDirectory().isLoaded;
}

export * from "./customer-directory";
export * from "./salesman-registry";
export * from "./env";
export * from "./paths";
export * from "./onelake-refresh";
export * from "./stock-cover";
export * from "./stock-filter-config";
export * from "./promotion-credit";
export * from "./promotion-lookup";
export * from "./promotion-context";
export * from "./sku-master";
export * from "./sold-history";
export * from "./vda-aos-bill";
export * from "./ensure-vda-sales-rep";
