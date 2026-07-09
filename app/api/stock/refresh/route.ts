import { NextResponse } from "next/server";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import {
  ensureFabricMastersFresh,
  reloadFabricMasters,
} from "@/lib/fabric";
import { fabricStockEnabled } from "@/lib/fabric/env";
import {
  buildSoldHistorySpec,
  buildStockCoverSpec,
  localFileStats,
  refreshOne,
} from "@/lib/fabric/onelake-refresh";
import { getSoldHistoryCsvPath, getStockCoverCsvPath } from "@/lib/fabric/paths";

/** ร้านค้ากดรีเฟรชเพื่อดึงสต็อก + ยอดขายล่าสุดจาก Fabric */
export async function POST() {
  const store = await getCustomerStoreFromCookie();
  if (!store) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let stockCover = false;
  let soldHistory = false;
  const errors: string[] = [];

  if (fabricStockEnabled()) {
    const stockSpec = buildStockCoverSpec(getStockCoverCsvPath());
    if (stockSpec) {
      stockCover = await refreshOne(stockSpec, { allowInteractive: false });
      if (!stockCover) errors.push("stock_cover_day");
    } else {
      errors.push("stock_cover_config");
    }
  } else {
    errors.push("fabric_stock_disabled");
  }

  const soldSpec = buildSoldHistorySpec(getSoldHistoryCsvPath());
  if (soldSpec) {
    try {
      soldHistory = await refreshOne(soldSpec, { allowInteractive: false });
      if (!soldHistory) errors.push("sold_history");
    } catch (err) {
      console.warn("[stock/refresh] sold history failed:", err);
      errors.push("sold_history");
    }
  }

  reloadFabricMasters();
  ensureFabricMastersFresh();

  const cacheStats = {
    stockCover: localFileStats(getStockCoverCsvPath()),
    soldHistory: localFileStats(getSoldHistoryCsvPath()),
  };

  if (fabricStockEnabled() && !stockCover) {
    return NextResponse.json(
      {
        success: false,
        stockCover,
        soldHistory,
        errors,
        cacheStats,
        message:
          "ดึง stock_cover_day จาก Fabric ไม่สำเร็จ — แสดงข้อมูลจาก cache ล่าสุดที่มี",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    stockCover,
    soldHistory,
    errors: errors.length > 0 ? errors : undefined,
    cacheStats,
    message:
      stockCover || soldHistory
        ? "อัปเดตข้อมูลล่าสุดแล้ว"
        : "โหลดข้อมูลจาก cache",
  });
}
