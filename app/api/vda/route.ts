import { NextResponse } from "next/server";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { getStockFilterConfig } from "@/lib/fabric/stock-filter-config";
import { fabricStockReady } from "@/lib/fabric";

export async function GET() {
  if (!fabricStockReady()) {
    return NextResponse.json({ sources: [], filterMode: null });
  }

  const config = getStockFilterConfig();
  return NextResponse.json({
    sources: listStockFromDbSources(config),
    filterMode: config.filterMode,
  });
}
