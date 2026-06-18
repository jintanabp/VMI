import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { runMasterRefreshNow } from "@/lib/fabric/scheduler";

export async function POST() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runMasterRefreshNow();
  if (!result.ok) {
    return NextResponse.json(
      { error: "Refresh failed", ...result },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, ...result });
}
