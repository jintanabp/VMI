import fs from "fs";
import path from "path";

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
  const files = [
    "dim_customer.csv",
    "cross_salesman_reference_email.csv",
    "stock_cover_day.csv",
    "cft_promotion_credit.csv",
    "item_barcode_map_v2.csv",
  ];
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
