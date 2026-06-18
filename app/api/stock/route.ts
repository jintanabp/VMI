import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRepositories } from "@/lib/repositories";
import { fabricStockReady } from "@/lib/fabric";
import { buildFabricStockPayload } from "@/lib/fabric/stock-rows";
import { getStockFilterConfig } from "@/lib/fabric/stock-filter-config";
import {
  CUSTOMER_STORE_COOKIE,
  CUSTOMER_STORE_CODE_COOKIE,
} from "@/lib/auth/roles";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeIdParam = searchParams.get("storeId");
  const fromDbParam = searchParams.get("fromDb");
  const cookieStore = await cookies();
  const storeId = storeIdParam ?? cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;
  const storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value;
  const fromDb = fromDbParam ?? storeCode;

  if (!storeId) {
    return NextResponse.json({ error: "ไม่พบ session" }, { status: 401 });
  }

  if (fabricStockReady() && storeCode) {
    const payload = await buildFabricStockPayload(storeId, storeCode, fromDb);
    return NextResponse.json(payload);
  }

  const { stock } = getRepositories();
  const rows = await stock.getStoreStock(storeId);
  const config = getStockFilterConfig();
  return NextResponse.json({
    sources: [],
    activeFromDb: null,
    filterMode: config.filterMode,
    rows,
  });
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;
  const storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value;

  if (!storeId) {
    return NextResponse.json({ error: "ไม่พบ session" }, { status: 401 });
  }

  const body = await request.json();
  const { skuId, minDays, maxDays } = body;

  if (!skuId) {
    return NextResponse.json({ error: "ไม่พบ SKU" }, { status: 400 });
  }

  const { stock } = getRepositories();
  await stock.updateStockThresholds(storeId, skuId, { minDays, maxDays });

  if (fabricStockReady() && storeCode) {
    const fromDb =
      new URL(request.url).searchParams.get("fromDb") ?? storeCode;
    const payload = await buildFabricStockPayload(storeId, storeCode, fromDb);
    const updated = payload.rows.find((r) => r.skuId === skuId);
    return NextResponse.json(updated ?? null);
  }

  const rows = await stock.getStoreStock(storeId);
  const updated = rows.find((r) => r.skuId === skuId);
  return NextResponse.json(updated);
}
