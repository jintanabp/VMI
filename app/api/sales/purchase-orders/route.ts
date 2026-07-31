import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

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
  const search = (searchParams.get("search") ?? "").trim();
  const priceKind = searchParams.get("priceKind")?.trim();
  const dateFrom = searchParams.get("dateFrom")?.trim();
  const dateTo = searchParams.get("dateTo")?.trim();
  const sortParam = searchParams.get("sort");
  const sortKey =
    sortParam === "amount" || sortParam === "poNumber" ? sortParam : "issuedAt";
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const pageRaw = Number.parseInt(searchParams.get("page") ?? "", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const sizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw > 0
      ? Math.min(sizeRaw, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const where: Prisma.PurchaseOrderWhereInput = {};

  // ค้นได้ทั้งเลข PO และรหัส/ชื่อร้าน — เดิม client กรองเองหลังโหลดมา 200 แถว
  // จึงหาของที่อยู่นอก 200 แถวล่าสุดไม่เจอเลย
  if (search) {
    where.OR = [
      { poNumber: { contains: search.toUpperCase() } },
      { order: { store: { code: { contains: search.toLowerCase() } } } },
      { order: { store: { name: { contains: search } } } },
    ];
  }
  if (priceKind && priceKind !== "all") where.priceKind = priceKind;

  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from && !Number.isNaN(from.getTime())) {
    where.issuedAt = { ...(where.issuedAt as object), gte: from };
  }
  if (to && !Number.isNaN(to.getTime())) {
    // dateTo เป็นวันที่ล้วน — ครอบทั้งวันนั้น ไม่งั้นเลือกวันเดียวแล้วได้ 0 แถว
    to.setHours(23, 59, 59, 999);
    where.issuedAt = { ...(where.issuedAt as object), lte: to };
  }

  if (session.role !== "admin") {
    const codes = resolveSalesmanCodesForFilter(session);
    let allowed = resolveVdaCodesForSalesmanCodes(codes);
    if (allowed.length === 0 && session.role === "sales") {
      allowed = resolveAllPersonVdaCodes(session.email);
    }
    if (allowed.length === 0) {
      return NextResponse.json({
        items: [],
        total: 0,
        page: 1,
        pageSize,
        summary: { count: 0, totalQty: 0, totalAmount: 0, nonC4Count: 0 },
      });
    }
    const filtered =
      vdaCode && allowed.includes(vdaCode) ? [vdaCode] : allowed;
    where.order = { ...(where.order as object), store: { code: { in: filtered } } };
  } else if (vdaCode) {
    where.order = { ...(where.order as object), store: { code: vdaCode } };
  }

  const [rows, total, agg, nonC4Count] = await Promise.all([
    prisma.purchaseOrder.findMany({
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
      orderBy:
        sortKey === "amount"
          ? { totalAmount: sortDir }
          : sortKey === "poNumber"
            ? { poNumber: sortDir }
            : { issuedAt: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
    // สรุปคิดจากผลกรองทั้งหมด ไม่ใช่แค่หน้าที่เปิดอยู่
    prisma.purchaseOrder.aggregate({
      where,
      _sum: { totalQty: true, totalAmount: true },
    }),
    prisma.purchaseOrder.count({
      where: { ...where, NOT: { priceKind: "c4" } },
    }),
  ]);

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

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    summary: {
      count: total,
      totalQty: agg._sum.totalQty ?? 0,
      totalAmount: agg._sum.totalAmount ?? 0,
      nonC4Count,
    },
  });
}
