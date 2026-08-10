import { hasAnyOnelakeTargets } from "./env";
import { sendMasterRefreshAlert } from "./alert-email";
import {
  refreshAllMasters,
  type DatasetRefreshResult,
  type RefreshAllResult,
} from "./onelake-refresh";
import { bumpDataVersion } from "./data-version";
import { reloadFabricMasters } from "./index";
import {
  readMasterRefreshStatus,
  writeDatasetStatus,
  writeMasterRefreshStatus,
  type RefreshTrigger,
} from "./refresh-status";
import { syncFabricSalesReps } from "./sync-sales-reps";
import type { DatasetId } from "./datasets";

const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000];

/** อายุข้อมูลกลางที่ยอมรับได้ — เกินนี้ boot จะไล่ตามและปุ่มร้านจะสั่งดึงจริง */
export function maxDataAgeHours(): number {
  const n = Number(process.env.MASTER_REFRESH_MAX_AGE_HOURS ?? "20");
  return Number.isFinite(n) && n > 0 ? n : 20;
}

function getBangkokTime(): { hours: number; minutes: number; seconds: number } {
  const str = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
  const timePart = str.split(", ")[1] ?? "0:0:0";
  const [hours, minutes, seconds] = timePart.split(":").map(Number);
  return { hours, minutes, seconds };
}

function msUntilNextBangkok(hour: number, minute: number): number {
  const now = getBangkokTime();
  let diffSec =
    (hour - now.hours) * 3600 + (minute - now.minutes) * 60 - now.seconds;
  if (diffSec <= 0) diffSec += 24 * 3600;
  return diffSec * 1000;
}

export function getSchedule(): { hour: number; minute: number } {
  let hour = Number(process.env.MASTER_REFRESH_HOUR ?? "3");
  let minute = Number(process.env.MASTER_REFRESH_MINUTE ?? "30");
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) hour = 3;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 30;
  return { hour, minute };
}

/**
 * เปิดทุก environment — เดิมเปิดเฉพาะ NODE_ENV=production ทำให้ dev/staging
 * ไม่มี sync อัตโนมัติเลย และคนต้องกดปุ่มกันเอง
 * hasAnyOnelakeTargets() ยังตัดวงจรเครื่องที่ไม่มี credential Fabric อยู่
 */
export function isSchedulerEnabled(): boolean {
  return process.env.MASTER_REFRESH_ENABLED !== "false";
}

export function nextRunAt(): string {
  const { hour, minute } = getSchedule();
  return new Date(Date.now() + msUntilNextBangkok(hour, minute)).toISOString();
}

/**
 * in-flight guard บน globalThis — ร้าน 20 ร้านกดพร้อมกัน (หรือ scheduler ชนกับ
 * ปุ่มแอดมิน) ต้องได้ดาวน์โหลดครั้งเดียว ไม่ใช่ 20 ครั้งบนไฟล์ SKU 68MB
 */
const IN_FLIGHT_KEY = "__vmiMasterRefreshInFlight";

type InFlightHolder = typeof globalThis & {
  [IN_FLIGHT_KEY]?: Promise<MasterRefreshOutcome>;
};

export function isRefreshRunning(): boolean {
  return Boolean((globalThis as InFlightHolder)[IN_FLIGHT_KEY]);
}

export interface MasterRefreshOutcome {
  ok: boolean;
  trigger: RefreshTrigger;
  durationMs: number;
  datasets: DatasetRefreshResult[];
  /** boolean ชุดเดิม — ผู้เรียกเก่ายังใช้ได้ */
  result: Omit<RefreshAllResult, "datasets">;
  error?: string;
}

const EMPTY_FLAGS: Omit<RefreshAllResult, "datasets"> = {
  customer: false,
  salesman: false,
  stockCover: false,
  promotion: false,
  skuMaster: false,
  vdaProduct: false,
  crossTarget: false,
  soldHistory: false,
  assortedMapping: false,
};

async function doRefresh(
  trigger: RefreshTrigger,
  datasets?: DatasetId[]
): Promise<MasterRefreshOutcome> {
  const startedAt = Date.now();
  const { hour, minute } = getSchedule();

  writeMasterRefreshStatus({
    lastAttemptAt: new Date().toISOString(),
    lastTrigger: trigger,
    schedulerEnabled: isSchedulerEnabled(),
    scheduleHour: hour,
    scheduleMinute: minute,
  });

  if (!hasAnyOnelakeTargets()) {
    return {
      ok: false,
      trigger,
      durationMs: Date.now() - startedAt,
      datasets: [],
      result: EMPTY_FLAGS,
      error: "ไม่ได้ตั้งค่า workspace ของ Fabric",
    };
  }

  const only =
    datasets && datasets.length > 0 ? new Set<string>(datasets) : undefined;

  // ห้ามส่ง allowInteractive: true จาก HTTP path — เปิดเบราว์เซอร์ฝั่งเซิร์ฟเวอร์
  // ไม่ได้และเคยทำให้ POST ค้างจน reverse proxy timeout
  const all = await refreshAllMasters({ allowInteractive: false }, only);
  const { datasets: results, ...flags } = all;

  reloadFabricMasters();
  await syncFabricSalesReps();
  bumpDataVersion();

  const ok = results.some((r) => r.ok);
  const durationMs = Date.now() - startedAt;

  writeDatasetStatus(results, trigger);
  if (ok) {
    writeMasterRefreshStatus({
      lastSuccessAt: new Date().toISOString(),
      lastResult: flags,
      lastDurationMs: durationMs,
      lastError: undefined,
    });
  } else {
    const failed = results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`);
    writeMasterRefreshStatus({
      lastFailureAt: new Date().toISOString(),
      lastResult: flags,
      lastDurationMs: durationMs,
      lastError:
        failed.length > 0
          ? failed.join(" | ").slice(0, 800)
          : "ทุกไฟล์ดึงไม่สำเร็จ — ตรวจ ONELAKE/STOCK_ONELAKE credentials",
    });
  }

  // สำรอง DB เฉพาะรอบอัตโนมัติประจำวัน — ปุ่มที่คนกดต้องตอบเร็ว
  if (trigger === "scheduler" && ok) {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      await promisify(execFile)("node", ["scripts/backup-db.mjs"], {
        cwd: process.cwd(),
      });
    } catch (backupErr) {
      console.warn("[VMI refresh] Post-refresh backup skipped:", backupErr);
    }
  }

  console.info(
    `[VMI refresh] trigger=${trigger} ok=${ok} ${durationMs}ms`,
    results.map((r) => `${r.name}:${r.ok ? "ok" : r.error ?? "fail"}`).join(" ")
  );

  return { ok, trigger, durationMs, datasets: results, result: flags };
}

/**
 * ทางเข้าเดียวของการดึงข้อมูลจาก OneLake — ทุกทริกเกอร์ (scheduler / boot /
 * ปุ่มแอดมิน / ปุ่มร้าน / CLI) ผ่านตัวนี้ เพื่อให้ทั้งระบบได้ชุดข้อมูลเดียวกัน
 * เดิมปุ่มร้านมี orchestrator ของตัวเองที่โหลดแค่ 2 จาก 8 ไฟล์
 */
export function runMasterRefresh(opts: {
  trigger: RefreshTrigger;
  datasets?: DatasetId[];
}): Promise<MasterRefreshOutcome> {
  const g = globalThis as InFlightHolder;
  const running = g[IN_FLIGHT_KEY];
  if (running) return running;

  const p = doRefresh(opts.trigger, opts.datasets).finally(() => {
    delete g[IN_FLIGHT_KEY];
  });
  g[IN_FLIGHT_KEY] = p;
  return p;
}

async function runWithRetry(
  trigger: RefreshTrigger,
  maxRetries = RETRY_DELAYS_MS.length
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const outcome = await runMasterRefresh({ trigger });
    if (outcome.ok) return true;

    if (attempt >= maxRetries) {
      await sendMasterRefreshAlert(
        "[VMI] Fabric master refresh failed",
        `Refresh (${trigger}) failed after ${maxRetries + 1} attempt(s).\n\n` +
          `Error: ${outcome.error ?? readMasterRefreshStatus().lastError ?? "unknown"}\n\n` +
          `Time: ${new Date().toISOString()}`
      );
      return false;
    }
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    console.warn(
      `[VMI refresh] retry ${attempt + 1}/${maxRetries} in ${delay / 60_000} min`
    );
    await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

/** ปุ่มแอดมิน — เหลือเป็นตัวห่อ runMasterRefresh ตัวเดียว */
export async function runMasterRefreshNow(
  datasets?: DatasetId[]
): Promise<MasterRefreshOutcome> {
  return runMasterRefresh({ trigger: "admin", datasets });
}

/**
 * boot catch-up — instrumentation เดิมแค่ parse ไฟล์ที่มีอยู่ ไม่ดาวน์โหลดเลย
 * และไม่มีการไล่ตาม ⇒ restart หลังเวลา 03:30 = ไม่มีข้อมูลใหม่จนวันรุ่งขึ้น
 * และคอนเทนเนอร์ใหม่ boot มาโดยไม่มี CSV เลยแล้วพังค้าง
 */
export async function catchUpIfStale(): Promise<void> {
  if (!isSchedulerEnabled() || !hasAnyOnelakeTargets()) return;

  try {
    const { bootstrapMissingMasters } = await import("./datasets");
    const bootstrapped = await bootstrapMissingMasters();
    if (bootstrapped.length > 0) {
      writeDatasetStatus(bootstrapped, "boot");
      reloadFabricMasters();
      bumpDataVersion();
      console.info(
        `[VMI refresh] bootstrap โหลดไฟล์ที่ขาด ${bootstrapped.length} ไฟล์`
      );
    }
  } catch (err) {
    console.warn("[VMI refresh] bootstrap failed:", err);
  }

  const last = readMasterRefreshStatus().lastSuccessAt;
  const maxAgeMs = maxDataAgeHours() * 3_600_000;
  if (last && Date.now() - Date.parse(last) < maxAgeMs) return;

  console.info(
    `[VMI refresh] ข้อมูลกลางเก่ากว่า ${maxDataAgeHours()} ชม. — ไล่ตามในอีก 30 วิ`
  );
  // หน่วงไว้ให้เซิร์ฟเวอร์รับ traffic ได้ก่อน — ไฟล์ SKU 68MB ใช้เวลาสักพัก
  setTimeout(() => void runWithRetry("boot", 1), 30_000);
}

function scheduleNextLoop(hour: number, minute: number) {
  const delay = msUntilNextBangkok(hour, minute);
  console.info(
    `[VMI scheduler] Next refresh in ${(delay / 3_600_000).toFixed(1)}h (target ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} Asia/Bangkok)`
  );

  setTimeout(async () => {
    await runWithRetry("scheduler");
    const { hour: h, minute: m } = getSchedule();
    scheduleNextLoop(h, m);
  }, delay);
}

const globalKey = "__vmiMasterRefreshSchedulerStarted";

export function startMasterRefreshScheduler(): void {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: boolean;
  };

  if (g[globalKey]) return;
  if (!isSchedulerEnabled()) {
    console.info("[VMI scheduler] ปิดอยู่ (MASTER_REFRESH_ENABLED=false)");
    return;
  }
  if (!hasAnyOnelakeTargets()) {
    console.info("[VMI scheduler] No Fabric workspace configured — skip");
    return;
  }

  g[globalKey] = true;
  const { hour, minute } = getSchedule();

  console.info(
    `[VMI scheduler] Started — daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} Asia/Bangkok`
  );

  scheduleNextLoop(hour, minute);
}
