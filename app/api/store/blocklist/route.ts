import { NextResponse } from "next/server";
import { getStoreSession } from "@/lib/auth/store-session";
import { getAuthorizedStore } from "@/lib/auth/store-context";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  listBlocks,
  removeBlocks,
  upsertBlocks,
} from "@/lib/stock/blocklist-service";

async function resolveStore(): Promise<{
  storeId: string | null;
  email: string;
}> {
  const session = await getStoreSession();
  if (session) {
    return { storeId: session.storeId, email: session.email };
  }
  const store = await getAuthorizedStore();
  if (!store) return { storeId: null, email: "" };
  // โหมดเข้าดูร้าน — บันทึกอีเมลคนที่เข้าดูเป็นผู้ตั้ง เดิมเป็น "" ร้านเห็นรายการหยุดสั่ง
  // ที่ตัวเองไม่ได้ตั้งโดยไม่รู้ว่าใครทำ
  const email = store.viaAdminPreview
    ? ((await getRawSalesSession())?.email ?? "")
    : "";
  return { storeId: store.storeId, email };
}

export async function GET() {
  const { storeId } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ blocks: await listBlocks(storeId) });
}

export async function POST(request: Request) {
  // การหยุดสั่งเป็นการจัดการ order suggestion ของร้านเอง — ร้านที่ล็อกอินจัดการได้ทุกบัญชี
  const { storeId, email } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await upsertBlocks(storeId, email, body);
  return NextResponse.json(payload, { status });
}

export async function DELETE(request: Request) {
  const { storeId } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await removeBlocks(storeId, body);
  return NextResponse.json(payload, { status });
}
