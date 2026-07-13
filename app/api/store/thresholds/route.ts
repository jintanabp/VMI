import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStoreSession } from "@/lib/auth/store-session";
import { getRepositories } from "@/lib/repositories";
import { bumpStockDataVersion } from "@/lib/fabric/data-version";
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

  if (body.reset) {
    const section = String(body.section ?? "").trim();
    if (!section) {
      return NextResponse.json(
        { error: "ต้องระบุ section" },
        { status: 400 }
      );
    }

    await prisma.storeGroupThreshold.deleteMany({
      where: { storeId, section },
    });
    bumpStockDataVersion();

    const skuIds: string[] = Array.isArray(body.skuIds)
      ? body.skuIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];
    if (skuIds.length > 0) {
      const { stock } = getRepositories();
      await Promise.all(
        skuIds.map((skuId) =>
          stock.updateStockThresholds(storeId, skuId, {
            minDays: 7,
            maxDays: 15,
          })
        )
      );
    }

    return NextResponse.json({
      success: true,
      scope: "section-reset",
      minDays: 7,
      maxDays: 15,
    });
  }

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
    bumpStockDataVersion();
    return NextResponse.json({ success: true, scope: "sku" });
  }

  // bulk: หลายแบรนด์ (Section) พร้อมกัน
  if (Array.isArray(body.sections)) {
    const sections = [
      ...new Set(
        body.sections
          .map((s: unknown) => String(s).trim())
          .filter((s: string): s is string => s.length > 0)
      ),
    ] as string[];
    if (sections.length === 0) {
      return NextResponse.json(
        { error: "ต้องเลือกอย่างน้อย 1 แบรนด์" },
        { status: 400 }
      );
    }
    await prisma.$transaction(
      sections.map((section) =>
        prisma.storeGroupThreshold.upsert({
          where: { storeId_section: { storeId, section } },
          create: { storeId, section, minDays, maxDays },
          update: { minDays, maxDays },
        })
      )
    );
    bumpStockDataVersion();
    return NextResponse.json({
      success: true,
      scope: "sections",
      count: sections.length,
    });
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
  bumpStockDataVersion();

  return NextResponse.json({ success: true, scope: "section" });
}
