import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensurePrismaStore } from "@/lib/repositories/store-helpers";
import { fabricStockReady } from "@/lib/fabric";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { setAdminPreviewCookie } from "@/lib/auth/admin-preview";
import { syncStockCoverForStore } from "@/lib/fabric/sync-stock-cover";
import { ensureVdaStoreSalesRep } from "@/lib/fabric/ensure-vda-sales-rep";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import {
  CUSTOMER_STORE_COOKIE,
  CUSTOMER_STORE_CODE_COOKIE,
} from "@/lib/auth/roles";

function formatVdaName(code: string) {
  return code.toUpperCase();
}

async function setCustomerCookies(storeId: string, code: string) {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_STORE_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.set(CUSTOMER_STORE_CODE_COOKIE, code, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function POST(request: Request) {
  // เข้าร้านโดยเลือก VDA เฉยๆ ไม่มีรหัสผ่าน — เป็นช่องทางพรีวิวของแอดมินเท่านั้น
  // ร้านจริงต้องเข้าผ่าน /api/auth/store/login (StoreAccount + รหัสผ่าน)
  const salesSession = await getRawSalesSession();
  if (salesSession?.role !== "admin") {
    return NextResponse.json(
      { error: "ต้องเป็นผู้ดูแลระบบจึงจะเข้าดูร้านแบบนี้ได้" },
      { status: 403 }
    );
  }

  if (!fabricStockReady()) {
    return NextResponse.json(
      { error: "ยังไม่พร้อมใช้งาน — ต้อง sync stock_cover_day จาก Fabric ก่อน" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const code = String(body.vda ?? body.storeCode ?? "").trim().toLowerCase();

  if (!code) {
    return NextResponse.json({ error: "กรุณาเลือก VDA" }, { status: 400 });
  }

  const sources = listStockFromDbSources();
  if (sources.length > 0 && !sources.some((s) => s.toLowerCase() === code)) {
    return NextResponse.json({ error: "ไม่พบ VDA นี้" }, { status: 404 });
  }

  const dbStore = await ensurePrismaStore(code, formatVdaName(code));
  await syncStockCoverForStore(dbStore.id, code);
  await ensureVdaStoreSalesRep(dbStore.id, code);

  await setAdminPreviewCookie();

  await setCustomerCookies(dbStore.id, code);
  return NextResponse.json({
    success: true,
    vda: code,
    store: { id: dbStore.id, code: dbStore.code, name: dbStore.name },
  });
}
