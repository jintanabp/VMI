import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStoreSession } from "@/lib/auth/store-session";
import { getRepositories } from "@/lib/repositories";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";

async function resolveStoreId(): Promise<{
  storeId: string | null;
  canManage: boolean;
}> {
  const session = await getStoreSession();
  if (session) {
    return { storeId: session.storeId, canManage: session.canManageMinMax };
  }
  // admin preview / legacy — ดูได้อย่างเดียว
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value ?? null;
  return { storeId, canManage: false };
}

export async function GET() {
  const { storeId, canManage } = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const groups = await prisma.storeGroupThreshold.findMany({
    where: { storeId },
    orderBy: { section: "asc" },
  });

  return NextResponse.json({
    canManage,
    groups: groups.map((g) => ({
      section: g.section,
      minDays: g.minDays,
      maxDays: g.maxDays,
    })),
  });
}

function parseDays(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

export async function PATCH(request: Request) {
  const { storeId, canManage } = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManage) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิจัดการ min/max" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const minDays = parseDays(body.minDays, 7);
  const maxDays = parseDays(body.maxDays, 15);
  if (maxDays < minDays) {
    return NextResponse.json(
      { error: "MAX ต้องไม่น้อยกว่า MIN" },
      { status: 400 }
    );
  }

  // per-SKU override
  if (body.skuId) {
    const { stock } = getRepositories();
    await stock.updateStockThresholds(storeId, String(body.skuId), {
      minDays,
      maxDays,
    });
    return NextResponse.json({ success: true, scope: "sku" });
  }

  // group (Section) default
  const section = String(body.section ?? "").trim();
  if (!section) {
    return NextResponse.json(
      { error: "ต้องระบุ section หรือ skuId" },
      { status: 400 }
    );
  }

  await prisma.storeGroupThreshold.upsert({
    where: { storeId_section: { storeId, section } },
    create: { storeId, section, minDays, maxDays },
    update: { minDays, maxDays },
  });

  return NextResponse.json({ success: true, scope: "section" });
}
