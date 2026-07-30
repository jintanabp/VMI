import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";
import { getStoreSession } from "@/lib/auth/store-session";
import {
  countUnreadStoreNotifications,
  listStoreNotifications,
  markStoreNotificationsRead,
} from "@/lib/orders/store-notify";

export const dynamic = "force-dynamic";

async function resolveStoreId(): Promise<string | null> {
  const session = await getStoreSession();
  if (session) return session.storeId;
  const cookieStore = await cookies();
  return cookieStore.get(CUSTOMER_STORE_COOKIE)?.value ?? null;
}

/** `?count=1` = เอาแค่จำนวนที่ยังไม่อ่าน (ใช้ทำ badge — ถูกและ poll ได้ถี่) */
export async function GET(request: Request) {
  const storeId = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("count") === "1") {
    return NextResponse.json({
      unread: await countUnreadStoreNotifications(storeId),
    });
  }

  const items = await listStoreNotifications(storeId);
  return NextResponse.json({
    items,
    unread: items.filter((n) => !n.readAt).length,
  });
}

/** ทำเครื่องหมายว่าอ่านแล้ว — ไม่ส่ง ids มาคือทำทั้งหมด */
export async function PATCH(request: Request) {
  const storeId = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.map((v) => String(v)).filter(Boolean)
    : undefined;
  const count = await markStoreNotificationsRead(storeId, ids);
  return NextResponse.json({ success: true, count });
}
