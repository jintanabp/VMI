import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  getCacheFileAges,
  readMasterRefreshStatus,
} from "@/lib/fabric/refresh-status";
import { isSchedulerEnabled } from "@/lib/fabric/scheduler";

export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    schedulerEnabled: isSchedulerEnabled(),
    status: readMasterRefreshStatus(),
    cacheFiles: getCacheFileAges(),
  });
}
