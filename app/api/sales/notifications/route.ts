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

  const [blocks, orderNotifs] = await Promise.all([
    prisma.storeSkuBlock.findMany({
      where: { store: { is: scope } },
      include: {
        store: { select: { code: true, name: true } },
        sku: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.salesNotification.findMany({
      where: { store: { is: scope } },
      include: { store: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const orderItems = orderNotifs
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      detail: n.detail,
      orderId: n.orderId,
      storeCode: n.store.code,
      storeName: n.store.name,
      createdAt: n.createdAt.toISOString(),
      acknowledged: n.acknowledgedAt != null,
    }))
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged));

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

  const blockUnseen = items.filter((i) => !i.acknowledged).length;
  const orderUnseen = orderItems.filter((i) => !i.acknowledged).length;

  return NextResponse.json({
    items,
    orderItems,
    blockUnseenCount: blockUnseen,
    orderUnseenCount: orderUnseen,
    // unseenCount = รวมทั้งสองแหล่ง ให้ badge บนเมนูใช้ค่าเดียวจบ
    unseenCount: blockUnseen + orderUnseen,
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
  // ไม่ส่ง type = "block" เพื่อให้ client เดิมที่ยิงมาแบบเก่ายังทำงานเหมือนเดิม
  const type = body.type === "order" ? "order" : "block";

  const where = {
    store: { is: scope },
    acknowledgedAt: null,
    ...(ids.length > 0 ? { id: { in: ids } } : {}),
  };
  const data = { acknowledgedAt: new Date() };

  const result =
    type === "order"
      ? await prisma.salesNotification.updateMany({ where, data })
      : await prisma.storeSkuBlock.updateMany({ where, data });

  return NextResponse.json({ success: true, count: result.count });
}
