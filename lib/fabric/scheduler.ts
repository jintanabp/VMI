import { hasAnyOnelakeTargets } from "./env";
import { sendMasterRefreshAlert } from "./alert-email";
import {
  buildCustomerSpec,
  buildSalesmanSpec,
  refreshAllMasters,
} from "./onelake-refresh";
import { reloadFabricMasters } from "./index";
import {
  writeMasterRefreshStatus,
} from "./refresh-status";
import { syncFabricSalesReps } from "./sync-sales-reps";
import { getCustomerCsvPath, getSalesmanCsvPath } from "./paths";

const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000];

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

function parseSchedule(): { hour: number; minute: number } {
  let hour = Number(process.env.MASTER_REFRESH_HOUR ?? "3");
  let minute = Number(process.env.MASTER_REFRESH_MINUTE ?? "30");
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) hour = 3;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 30;
  return { hour, minute };
}

export function isSchedulerEnabled(): boolean {
  if (process.env.MASTER_REFRESH_ENABLED === "false") return false;
  if (process.env.MASTER_REFRESH_ENABLED === "true") return true;
  return process.env.NODE_ENV === "production";
}

async function runRefreshWithRetry(maxRetries = 3): Promise<boolean> {
  writeMasterRefreshStatus({
    lastAttemptAt: new Date().toISOString(),
    schedulerEnabled: isSchedulerEnabled(),
  });

  let lastError = "unknown error";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await refreshAllMasters({ allowInteractive: false });
      if (
        !result.customer &&
        !result.salesman &&
        !result.stockCover &&
        !result.promotion &&
        !result.skuMaster &&
        !result.vdaAos
      ) {
        throw new Error("refresh returned no successful files");
      }
      reloadFabricMasters();
      await syncFabricSalesReps();
      writeMasterRefreshStatus({
        lastSuccessAt: new Date().toISOString(),
        lastResult: result,
        lastError: undefined,
      });
      try {
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);
        await execFileAsync("node", ["scripts/backup-db.mjs"], {
          cwd: process.cwd(),
        });
      } catch (backupErr) {
        console.warn("[VMI scheduler] Post-refresh backup skipped:", backupErr);
      }
      console.info(
        `[VMI scheduler] Master refresh OK (attempt ${attempt + 1}):`,
        result
      );
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const isLast = attempt >= maxRetries;
      console.error(
        `[VMI scheduler] Refresh failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
        err
      );
      if (isLast) {
        writeMasterRefreshStatus({
          lastFailureAt: new Date().toISOString(),
          lastError,
        });
        await sendMasterRefreshAlert(
          "[VMI] Fabric master refresh failed",
          `Scheduled master refresh failed after ${maxRetries + 1} attempt(s).\n\nError: ${lastError}\n\nTime: ${new Date().toISOString()}`
        );
        return false;
      }
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}

/** Manual / API trigger — interactive auth fallback like ocr-po-matching admin pull. */
export async function runMasterRefreshNow(): Promise<{
  ok: boolean;
  customer: boolean;
  salesman: boolean;
  stockCover: boolean;
  promotion: boolean;
  skuMaster: boolean;
  vdaAos: boolean;
}> {
  if (!hasAnyOnelakeTargets()) {
    return {
      ok: false,
      customer: false,
      salesman: false,
      stockCover: false,
      promotion: false,
      skuMaster: false,
      vdaAos: false,
    };
  }
  const result = await refreshAllMasters({ allowInteractive: true });
  reloadFabricMasters();
  await syncFabricSalesReps();
  const ok =
    result.customer ||
    result.salesman ||
    result.stockCover ||
    result.promotion ||
    result.skuMaster ||
    result.vdaAos;
  if (ok) {
    writeMasterRefreshStatus({
      lastSuccessAt: new Date().toISOString(),
      lastResult: result,
      lastError: undefined,
    });
  }
  return { ok, ...result };
}

function scheduleNextLoop(hour: number, minute: number) {
  const delay = msUntilNextBangkok(hour, minute);
  console.info(
    `[VMI scheduler] Next refresh in ${(delay / 3_600_000).toFixed(1)}h (target ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} Asia/Bangkok)`
  );

  setTimeout(async () => {
    await runRefreshWithRetry();
    const { hour: h, minute: m } = parseSchedule();
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
    console.info("[VMI scheduler] Disabled (set MASTER_REFRESH_ENABLED=true to enable)");
    return;
  }
  if (!hasAnyOnelakeTargets()) {
    console.info("[VMI scheduler] No Fabric workspace configured — skip");
    return;
  }

  g[globalKey] = true;
  const { hour, minute } = parseSchedule();

  console.info(
    `[VMI scheduler] Started — daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} Asia/Bangkok`
  );

  // Bootstrap specs paths are used inside refreshAllMasters
  void buildCustomerSpec(getCustomerCsvPath());
  void buildSalesmanSpec(getSalesmanCsvPath());

  scheduleNextLoop(hour, minute);
}
