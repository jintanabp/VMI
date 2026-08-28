import { NextResponse } from "next/server";
import { getStoreSession } from "@/lib/auth/store-session";
import { getAuthorizedStoreId } from "@/lib/auth/store-context";
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
  return { storeId: await getAuthorizedStoreId(), email: "" };
}

export async function GET() {
  const { storeId } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ blocks: await listBlocks(storeId) });
}

export async function POST(request: Request) {
  // การหยุดสั่งเป็นการจัดการ order suggestion ของร้านเอง — ร้านที่ล็อกอินจัดการได้ทุกบัญชี
  const { storeId, email } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await upsertBlocks(storeId, email, body);
  return NextResponse.json(payload, { status });
}

export async function DELETE(request: Request) {
  const { storeId } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await removeBlocks(storeId, body);
  return NextResponse.json(payload, { status });
}
