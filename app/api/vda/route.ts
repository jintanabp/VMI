import { NextResponse } from "next/server";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { getStockFilterConfig } from "@/lib/fabric/stock-filter-config";
import { fabricStockReady } from "@/lib/fabric";
import { resolveVdaStoreNames } from "@/lib/fabric/vda-store-name";

export async function GET() {
  if (!fabricStockReady()) {
    return NextResponse.json({ sources: [], names: {}, filterMode: null });
  }

  const config = getStockFilterConfig();
  const sources = listStockFromDbSources(config);
  return NextResponse.json({
    sources,
    // ชื่อร้านของแต่ละ VDA (เฉพาะที่ map ได้) — sources ยังเป็น string[] เหมือนเดิม
    names: resolveVdaStoreNames(sources),
    filterMode: config.filterMode,
  });
}
