import fs from "fs";
import path from "path";
import {
  getCustomerCsvPath,
  getPromotionCsvPath,
  getSalesmanCsvPath,
  getSkuMasterCsvPath,
  getStockCoverCsvPath,
} from "./paths";

export interface MasterRefreshStatus {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  lastResult?: {
    customer: boolean;
    salesman: boolean;
    stockCover: boolean;
    promotion: boolean;
    skuMaster: boolean;
    vdaAos: boolean;
  };
  schedulerEnabled?: boolean;
}

function statusPath() {
  const logDir =
    process.env.VMI_STATUS_DIR?.trim() ||
    path.join(process.cwd(), "data", "logs");
  return path.join(logDir, "master-refresh-status.json");
}

export function readMasterRefreshStatus(): MasterRefreshStatus {
  try {
    const raw = fs.readFileSync(statusPath(), "utf-8");
    return JSON.parse(raw) as MasterRefreshStatus;
  } catch {
    return {};
  }
}

export function writeMasterRefreshStatus(
  patch: Partial<MasterRefreshStatus>
): MasterRefreshStatus {
  const file = statusPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...readMasterRefreshStatus(), ...patch };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function getCacheFileAges(): Record<string, string | null> {
  const cacheDir =
    process.env.FABRIC_CACHE_DIR?.trim() ||
    path.join(process.cwd(), "data", "cache");
  // ดึงชื่อจาก paths.ts จุดเดียว — เดิม hard-code ไว้แล้ว drift เมื่อเปลี่ยนไฟล์ต้นทาง
  // (แผงอายุ cache จะรายงานไฟล์ที่ไม่มีอยู่จริงตลอดไปโดยไม่มีใครสังเกต)
  const files = [
    getCustomerCsvPath(),
    getSalesmanCsvPath(),
    getStockCoverCsvPath(),
    getPromotionCsvPath(),
    getSkuMasterCsvPath(),
  ].map((p) => path.basename(p));
  const ages: Record<string, string | null> = {};
  for (const name of files) {
    const p = path.join(cacheDir, name);
    try {
      const mtime = fs.statSync(p).mtime;
      ages[name] = mtime.toISOString();
    } catch {
      ages[name] = null;
    }
  }
  return ages;
}
