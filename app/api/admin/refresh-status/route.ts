import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  datasetStatusFor,
  readMasterRefreshStatus,
} from "@/lib/fabric/refresh-status";
import {
  getSchedule,
  isRefreshRunning,
  isSchedulerEnabled,
  maxDataAgeHours,
  nextRunAt,
} from "@/lib/fabric/scheduler";
import { getDatasetInventory } from "@/lib/fabric/datasets";
import { fabricPromoReady, promoLoadError } from "@/lib/fabric";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  // นับแถวใหม่แพงมาก (item_barcode_map_v2.csv 68MB) — ปกติใช้ค่าที่บันทึกไว้ตอน sync
  const countRows = searchParams.get("rows") === "1";

  const status = readMasterRefreshStatus();
  const schedule = getSchedule();
  const maxAge = maxDataAgeHours();

  const datasets = getDatasetInventory({ countRows }).map((row) => {
    const entry = datasetStatusFor(status, row.id);
    const rows = row.rows ?? entry?.rows ?? null;
    return {
      ...row,
      rows,
      belowMinRows: rows != null && row.minRows > 0 && rows < row.minRows,
      stale: row.ageHours != null && row.ageHours > maxAge,
      lastOk: entry?.ok ?? null,
      lastError: entry?.error ?? null,
      lastDurationMs: entry?.durationMs ?? null,
      lastAt: entry?.at ?? null,
      lastTrigger: entry?.trigger ?? null,
      skipped: entry?.skipped ?? !row.configured,
    };
  });

  return NextResponse.json({
    schedulerEnabled: isSchedulerEnabled(),
    schedule: { ...schedule, tz: "Asia/Bangkok" },
    nextRunAt: isSchedulerEnabled() ? nextRunAt() : null,
    maxDataAgeHours: maxAge,
    running: isRefreshRunning(),
    status,
    datasets,
    promoReady: fabricPromoReady(),
    promoError: promoLoadError(),
    // จำนวน SKU ที่ได้โปรจริงจากรอบ sync ล่าสุด — promoReady บอกได้แค่ว่าไฟล์โหลดผ่าน
    // ซึ่งเป็น true อยู่ดีในรอบที่โปรหายเกลี้ยง ตัวเลขนี้คือตัวเดียวที่บอกความต่างได้
    promoCoverage: status.promoCoverage ?? null,
  });
}
