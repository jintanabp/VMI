import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import {
  listBlocks,
  removeBlocks,
  upsertBlocks,
} from "@/lib/stock/blocklist-service";

export const dynamic = "force-dynamic";

async function requireAdminAndStore(request: Request): Promise<
  | { ok: true; storeId: string; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId")?.trim();
  const storeCode = searchParams.get("storeCode")?.trim().toLowerCase();

  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } })
    : storeCode
      ? await prisma.store.findUnique({ where: { code: storeCode }, select: { id: true } })
      : null;

  if (!storeId && !storeCode) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "ต้องระบุ storeId หรือ storeCode" },
        { status: 400 }
      ),
    };
  }
  if (!store) {
    return {
      ok: false,
      res: NextResponse.json({ error: "ไม่พบร้านค้านี้" }, { status: 404 }),
    };
  }
  return { ok: true, storeId: store.id, email: session.email };
}

export async function GET(request: Request) {
  const guard = await requireAdminAndStore(request);
  if (!guard.ok) return guard.res;
  return NextResponse.json({
    storeId: guard.storeId,
    blocks: await listBlocks(guard.storeId),
  });
}

export async function POST(request: Request) {
  const guard = await requireAdminAndStore(request);
  if (!guard.ok) return guard.res;
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await upsertBlocks(
    guard.storeId,
    guard.email,
    body
  );
  return NextResponse.json(payload, { status });
}

export async function DELETE(request: Request) {
  const guard = await requireAdminAndStore(request);
  if (!guard.ok) return guard.res;
  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await removeBlocks(guard.storeId, body);
  return NextResponse.json(payload, { status });
}
