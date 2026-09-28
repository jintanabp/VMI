import { NextResponse } from "next/server";
import {
  getAuthorizedStore,
  getAuthorizedStoreId,
} from "@/lib/auth/store-context";
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const store = await getAuthorizedStore();
  if (!store) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // แอดมิน/ผู้สร้างเข้าดูร้าน (VDA preview) แค่เปิดกระดิ่งดูต้องไม่ทำให้ร้านตัวจริง
  // เห็นว่าแจ้งเตือนถูกอ่านไปแล้ว — ตอบสำเร็จแต่ไม่เขียนอะไร
  if (store.viaAdminPreview) {
    return NextResponse.json({ success: true, count: 0, preview: true });
  }
  const storeId = store.storeId;
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  // ไม่ส่ง ids = อ่านทั้งหมด · ส่ง ids มา = เฉพาะที่ระบุ — เดิม `ids: []` หรือ ids ที่ไม่ใช่ array
  // กลายเป็น "อ่านทั้งหมด" ไปด้วย (QA 28 ก.ย. 69)
  if (body.ids !== undefined && !Array.isArray(body.ids)) {
    return NextResponse.json({ error: "ids ต้องเป็นรายการ" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map((v) => String(v)).filter(Boolean)
    : undefined;
  if (ids && ids.length === 0) {
    return NextResponse.json({ success: true, count: 0 });
  }
  const count = await markStoreNotificationsRead(storeId, ids);
  return NextResponse.json({ success: true, count });
}
