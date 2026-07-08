import { NextResponse } from "next/server";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { reloadFabricMasters } from "@/lib/fabric";
import { fabricStockEnabled } from "@/lib/fabric/env";
import {
  buildSoldHistorySpec,
  buildStockCoverSpec,
  refreshOne,
} from "@/lib/fabric/onelake-refresh";
import { getSoldHistoryCsvPath, getStockCoverCsvPath } from "@/lib/fabric/paths";

/** กันการกดรัวเกินไป — เว้นระยะขั้นต่ำระหว่างการรีเฟรช (ทั้งระบบ) */
const MIN_INTERVAL_MS = 20_000;
const globalKey = "__vmiStockRefreshAt";

function lastRefreshAt(): number {
  const g = globalThis as typeof globalThis & { [globalKey]?: number };
  return g[globalKey] ?? 0;
}
function markRefreshed() {
  const g = globalThis as typeof globalThis & { [globalKey]?: number };
  g[globalKey] = Date.now();
}

/** ร้านค้ากดรีเฟรชเพื่อดึงสต็อก + ยอดขายล่าสุดจาก Fabric */
export async function POST() {
  const store = await getCustomerStoreFromCookie();
  if (!store) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = Date.now() - lastRefreshAt();
  if (since < MIN_INTERVAL_MS) {
    // เพิ่งรีเฟรชไป — reload cache แล้วตอบกลับทันที
    reloadFabricMasters();
    return NextResponse.json({
      success: true,
      throttled: true,
      retryInMs: MIN_INTERVAL_MS - since,
    });
  }
  markRefreshed();

  let stockCover = false;
  let soldHistory = false;

  if (fabricStockEnabled()) {
    const stockSpec = buildStockCoverSpec(getStockCoverCsvPath());
    if (stockSpec) {
      stockCover = await refreshOne(stockSpec, { allowInteractive: false });
    }
  }

  const soldSpec = buildSoldHistorySpec(getSoldHistoryCsvPath());
  if (soldSpec) {
    try {
      soldHistory = await refreshOne(soldSpec, { allowInteractive: false });
    } catch (err) {
      console.warn("[stock/refresh] sold history failed:", err);
    }
  }

  reloadFabricMasters();

  return NextResponse.json({ success: true, stockCover, soldHistory });
}
