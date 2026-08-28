import { NextResponse } from "next/server";
import { getAuthorizedStoreId } from "@/lib/auth/store-context";
import {
  countUnreadStoreNotifications,
  listStoreNotifications,
  markStoreNotificationsRead,
} from "@/lib/orders/store-notify";

export const dynamic = "force-dynamic";

const resolveStoreId = getAuthorizedStoreId;

/** `?count=1` = เอาแค่จำนวนที่ยังไม่อ่าน (ใช้ทำ badge — ถูกและ poll ได้ถี่) */
export async function GET(request: Request) {
  const storeId = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("count") === "1") {
    // `?since=` ให้ badge poll เดิมได้รายการใหม่มาเด้ง toast ในคำขอเดียว
    // (ไม่ส่ง since = พฤติกรรมเดิมทุกประการ)
    const sinceRaw = searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : null;
    const unread = await countUnreadStoreNotifications(storeId);
    if (!since || Number.isNaN(since.getTime())) {
      return NextResponse.json({ unread });
    }
    const all = await listStoreNotifications(storeId);
    return NextResponse.json({
      unread,
      fresh: all.filter((n) => Date.parse(n.createdAt) > since.getTime()),
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
