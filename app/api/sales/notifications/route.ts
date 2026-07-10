import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSalesSession } from "@/lib/auth/sales-session";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";

/** เงื่อนไข store ที่เซลล์คนนี้ดูแล — admin เห็นทุกร้าน */
function storeScopeWhere(
  session: Awaited<ReturnType<typeof getSalesSession>>
): Prisma.StoreWhereInput | null {
  if (!session) return null;
  if (session.role === "admin") return {};

  const email = session.email.toLowerCase();
  const salesmanCodes = resolveSalesmanCodesForFilter(session);
  const vdas =
    session.role === "sales"
      ? [
          ...new Set([
            ...resolveVdaCodesForSalesmanCodes(salesmanCodes),
            ...resolveAllPersonVdaCodes(email),
          ]),
        ]
      : resolveVdaCodesForSalesmanCodes(salesmanCodes);
  const emails = (session.scopeEmails ?? [email]).map((e) => e.toLowerCase());

  return {
    OR: [
      { code: { in: vdas } },
      { salesRep: { is: { email: { in: emails } } } },
    ],
  };
}

export async function GET() {
  const session = await getSalesSession();
  const scope = storeScopeWhere(session);
  if (!scope) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const blocks = await prisma.storeSkuBlock.findMany({
    where: { store: { is: scope } },
    include: {
      store: { select: { code: true, name: true } },
      sku: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items = blocks
    .map((b) => ({
      id: b.id,
      storeCode: b.store.code,
      storeName: b.store.name,
      skuCode: b.sku.code,
      skuName: b.sku.name,
      reason: b.reason,
      effectiveFrom: b.effectiveFrom.toISOString(),
      createdAt: b.createdAt.toISOString(),
      acknowledged: b.acknowledgedAt != null,
    }))
    // ที่ยังไม่รับทราบขึ้นก่อน, ที่รับทราบแล้วไปอยู่ล่างสุด (คงลำดับ createdAt ในแต่ละกลุ่ม)
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged));

  return NextResponse.json({
    items,
    unseenCount: items.filter((i) => !i.acknowledged).length,
  });
}

export async function POST(request: Request) {
  const session = await getSalesSession();
  const scope = storeScopeWhere(session);
  if (!scope) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.map((v: unknown) => String(v)).filter(Boolean)
    : [];

  const result = await prisma.storeSkuBlock.updateMany({
    where: {
      store: { is: scope },
      acknowledgedAt: null,
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { acknowledgedAt: new Date() },
  });

  return NextResponse.json({ success: true, count: result.count });
}
