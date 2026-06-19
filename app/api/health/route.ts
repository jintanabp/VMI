import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fabricMastersEnabled,
  fabricMastersReady,
  fabricPromoReady,
  fabricSkuMasterReady,
} from "@/lib/fabric";
import { hasAnyOnelakeTargets } from "@/lib/fabric/env";
import { readMasterRefreshStatus } from "@/lib/fabric/refresh-status";
import { isSchedulerEnabled } from "@/lib/fabric/scheduler";

export async function GET() {
  try {
    const storeCount = await prisma.store.count();
    const refreshStatus = readMasterRefreshStatus();

    return NextResponse.json({
      ok: true,
      database: true,
      stores: storeCount,
      fabric: {
        enabled: fabricMastersEnabled(),
        mastersReady: fabricMastersReady(),
        promoReady: fabricPromoReady(),
        skuMasterReady: fabricSkuMasterReady(),
        onelakeConfigured: hasAnyOnelakeTargets(),
      },
      scheduler: {
        enabled: isSchedulerEnabled(),
        lastSuccessAt: refreshStatus.lastSuccessAt ?? null,
        lastFailureAt: refreshStatus.lastFailureAt ?? null,
        lastError: refreshStatus.lastError ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: false,
        error:
          error instanceof Error ? error.message : "Database connection failed",
      },
      { status: 500 }
    );
  }
}
