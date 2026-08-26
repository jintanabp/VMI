import fs from "fs";
import path from "path";
import type { DatasetId } from "./datasets";
import type { DatasetRefreshResult } from "./onelake-refresh";
import type { PromoCoverageSnapshot } from "./promo-coverage";

export type RefreshTrigger =
  | "scheduler"
  | "boot"
  | "admin"
  | "store"
  | "cli";

/** สถานะรอบล่าสุดของชุดข้อมูลหนึ่ง — ค่าทั้งหมดมาจาก DatasetRefreshResult */
export interface DatasetStatusEntry {
  ok: boolean;
  skipped: boolean;
  rows: number | null;
  bytes: number | null;
  mtime: string | null;
  durationMs: number;
  error: string | null;
  minRows: number;
  /**
   * ไฟล์ต้นทางที่รอบนี้ยิงไปจริง — ชื่อไฟล์ปลายทางในเครื่องไม่ได้พิสูจน์อะไรเลย
   * (cft_promotion_cash.csv ในเครื่องเคยมีเนื้อของ cft_promotion_credit.csv อยู่ทั้งใบ)
   */
  remotePath: string | null;
  /** เวลาที่บันทึกผลนี้ */
  at: string;
  trigger: RefreshTrigger;
}

export interface MasterRefreshStatus {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  /** boolean 6 ตัวแบบเดิม — เก็บไว้ให้ของเก่าที่อ่านอยู่ไม่พัง */
  lastResult?: {
    customer: boolean;
    salesman: boolean;
    stockCover: boolean;
    promotion: boolean;
    skuMaster: boolean;
    soldHistory?: boolean;
  };
  lastTrigger?: RefreshTrigger;
  lastDurationMs?: number;
  schedulerEnabled?: boolean;
  scheduleHour?: number;
  scheduleMinute?: number;
  /** สถานะรายชุดข้อมูล */
  datasets?: Record<string, DatasetStatusEntry>;
  /**
   * จำนวน SKU ที่ได้โปรจริงในรอบล่าสุด — ตัวตั้งต้นให้รอบถัดไปเทียบว่าตกผิดปกติไหม
   *
   * rows ของ dataset บอกแค่ว่าไฟล์มากี่แถว ซึ่งไม่ขยับเลยในบั๊กที่เคยเกิดจริง
   * (1848 แถวเท่าเดิม แต่ resolve ได้ 0 โปร) จึงต้องเก็บตัวเลขปลายทางแยกไว้
   */
  promoCoverage?: PromoCoverageSnapshot;
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
  const prev = readMasterRefreshStatus();
  const next: MasterRefreshStatus = { ...prev, ...patch };
  // datasets ต้อง merge ไม่ใช่ทับ — ไม่งั้น patch ที่ไม่มี datasets จะลบทิ้งทั้งก้อน
  if (patch.datasets) {
    next.datasets = { ...prev.datasets, ...patch.datasets };
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/**
 * บันทึกผลรายชุดข้อมูล — **merge รายคีย์** เพราะการกด "ดึงใหม่" รายตาราง
 * ส่งผลมาแค่ชุดเดียว ถ้าทับทั้งก้อนสถานะของอีก 10 ชุดจะหายไป
 */
export function writeDatasetStatus(
  results: DatasetRefreshResult[],
  trigger: RefreshTrigger
): MasterRefreshStatus {
  if (results.length === 0) return readMasterRefreshStatus();
  const at = new Date().toISOString();
  const datasets: Record<string, DatasetStatusEntry> = {};
  for (const r of results) {
    datasets[r.name] = {
      ok: r.ok,
      skipped: r.skipped,
      rows: r.rows,
      bytes: r.bytes,
      mtime: r.mtime,
      durationMs: r.durationMs,
      error: r.error,
      minRows: r.minRows,
      remotePath: r.remotePath,
      at,
      trigger,
    };
  }
  return writeMasterRefreshStatus({ datasets });
}

export function datasetStatusFor(
  status: MasterRefreshStatus,
  id: DatasetId
): DatasetStatusEntry | null {
  return status.datasets?.[id] ?? null;
}
