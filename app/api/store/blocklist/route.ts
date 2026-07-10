import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStoreSession } from "@/lib/auth/store-session";
import { bumpStockDataVersion } from "@/lib/fabric/data-version";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";

async function resolveStore(): Promise<{
  storeId: string | null;
  email: string;
  canManage: boolean;
}> {
  const session = await getStoreSession();
  if (session) {
    return {
      storeId: session.storeId,
      email: session.email,
      canManage: session.canManageMinMax,
    };
  }
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value ?? null;
  return { storeId, email: "", canManage: false };
}

function parseSkuIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((v) => String(v).trim()).filter((v) => v.length > 0)
    ),
  ];
}

export async function GET() {
  const { storeId } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const blocks = await prisma.storeSkuBlock.findMany({
    where: { storeId },
    include: { sku: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    blocks: blocks.map((b) => ({
      skuId: b.skuId,
      skuCode: b.sku.code,
      skuName: b.sku.name,
      reason: b.reason,
      effectiveFrom: b.effectiveFrom.toISOString(),
      createdAt: b.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const { storeId, email, canManage } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManage) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิจัดการรายการหยุดสั่ง" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const skuIds = parseSkuIds(body.skuIds);
  const reason = String(body.reason ?? "").trim();

  if (skuIds.length === 0) {
    return NextResponse.json(
      { error: "ต้องเลือกอย่างน้อย 1 สินค้า" },
      { status: 400 }
    );
  }
  if (!reason) {
    return NextResponse.json({ error: "ต้องระบุเหตุผล" }, { status: 400 });
  }

  const parsed = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
  const effectiveFrom = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  // กัน skuId ที่ไม่มีจริง (FK) — เฉพาะที่มีในตาราง Sku
  const existing = await prisma.sku.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
  const validIds = existing.map((s) => s.id);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 400 });
  }

  await prisma.$transaction(
    validIds.map((skuId) =>
      prisma.storeSkuBlock.upsert({
        where: { storeId_skuId: { storeId, skuId } },
        create: { storeId, skuId, reason, effectiveFrom, createdBy: email },
        update: { reason, effectiveFrom, createdBy: email, acknowledgedAt: null },
      })
    )
  );
  bumpStockDataVersion();

  return NextResponse.json({ success: true, count: validIds.length });
}

export async function DELETE(request: Request) {
  const { storeId, canManage } = await resolveStore();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManage) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิจัดการรายการหยุดสั่ง" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const skuIds = parseSkuIds(body.skuIds);
  if (skuIds.length === 0) {
    return NextResponse.json(
      { error: "ต้องเลือกอย่างน้อย 1 สินค้า" },
      { status: 400 }
    );
  }

  const result = await prisma.storeSkuBlock.deleteMany({
    where: { storeId, skuId: { in: skuIds } },
  });
  bumpStockDataVersion();

  return NextResponse.json({ success: true, count: result.count });
}
