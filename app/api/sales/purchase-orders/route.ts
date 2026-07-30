import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";

export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

export interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  groupKey: string;
  priceKind: string;
  itemCount: number;
  totalQty: number;
  totalAmount: number;
  issuedAt: string;
  issuedBy: string;
  orderId: string;
  storeCode: string;
  storeName: string;
  /** จำนวน PO ทั้งหมดที่ออกจากออเดอร์เดียวกัน — บอกว่าใบนี้ถูกแบ่งมา */
  siblingCount: number;
}

/**
 * PO ที่ออกแล้ว สำหรับหน้าพนักงาน
 * scope เดียวกับหน้าตรวจออเดอร์ — เซลส์เห็นเฉพาะคลังที่ตัวเองดูแล
 */
export async function GET(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const vdaCode = searchParams.get("vdaCode")?.trim().toLowerCase();
  const search = (searchParams.get("search") ?? "").trim().toUpperCase();
  const priceKind = searchParams.get("priceKind")?.trim();

  const where: {
    poNumber?: { contains: string };
    priceKind?: string;
    order?: { store: { code: string | { in: string[] } } };
  } = {};

  if (search) where.poNumber = { contains: search };
  if (priceKind && priceKind !== "all") where.priceKind = priceKind;

  if (session.role !== "admin") {
    const codes = resolveSalesmanCodesForFilter(session);
    let allowed = resolveVdaCodesForSalesmanCodes(codes);
    if (allowed.length === 0 && session.role === "sales") {
      allowed = resolveAllPersonVdaCodes(session.email);
    }
    if (allowed.length === 0) {
      return NextResponse.json({ items: [], truncated: false });
    }
    const filtered =
      vdaCode && allowed.includes(vdaCode) ? [vdaCode] : allowed;
    where.order = { store: { code: { in: filtered } } };
  } else if (vdaCode) {
    where.order = { store: { code: vdaCode } };
  }

  const rows = await prisma.purchaseOrder.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          store: { select: { code: true, name: true } },
          _count: { select: { purchaseOrders: true } },
        },
      },
    },
    orderBy: { issuedAt: "desc" },
    take: MAX_ROWS,
  });

  const items: PurchaseOrderRow[] = rows.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    groupKey: po.groupKey,
    priceKind: po.priceKind,
    itemCount: po.itemCount,
    totalQty: po.totalQty,
    totalAmount: po.totalAmount,
    issuedAt: po.issuedAt.toISOString(),
    issuedBy: po.issuedBy,
    orderId: po.order.id,
    storeCode: po.order.store.code,
    storeName: po.order.store.name,
    siblingCount: po.order._count.purchaseOrders,
  }));

  return NextResponse.json({ items, truncated: rows.length >= MAX_ROWS });
}
