import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSalesSession, salesPreviewReadOnly } from "@/lib/auth/sales-session";
import { isPoStatus } from "@/lib/po/po-status";
import { prisma } from "@/lib/prisma";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";
import {
  deleteOrdersForSession,
  MAX_DELETE_BATCH,
  resolveOrderIdsForPoNumbers,
} from "@/lib/orders/delete-orders";

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
  /** สถานะหลังออกเลข — ค่าที่ใช้ได้ดูที่ lib/po/po-status.ts */
  status: string;
  statusAt: string | null;
  statusBy: string;
  statusNote: string;
  orderId: string;
  storeCode: string;
  storeName: string;
  /** จำนวน PO ทั้งหมดที่ออกจากออเดอร์เดียวกัน — บอกว่าใบนี้ถูกแบ่งมา */
  siblingCount: number;
  erpSentAt: string | null;
  /** ไม่ว่าง = เคยพยายามส่ง ERP แล้วไม่สำเร็จ (ไม่ว่าจะปฏิเสธชัดเจนหรือผลไม่ชัดเจน) */
  erpError: string | null;
  /** "rejected" = ปฏิเสธชัดเจน · อย่างอื่น/null = ผลไม่ชัดเจน — ต่างจาก sibling badge เพราะ
   * บอกว่า "ใบนี้มีปัญหากับ ERP" ไม่ใช่แค่ "ออเดอร์นี้ถูกแบ่ง" (สองเรื่องนี้เคยปนกันจนดูสับสน) */
  erpFailureKind: string | null;
  /** ถูกแทนที่ด้วยเลขใหม่แล้ว (clone-for-erp) — ชี้ไปเลขใหม่ */
  replacedByPoNumber: string | null;
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
  /** ดู PO ของทุก VDA ที่อีเมลนี้ดูแล ไม่ใช่เฉพาะรหัสเซลล์ที่ active อยู่
   *  (พฤติกรรมเดียวกับหน้าตรวจออเดอร์ — เซลล์ที่ถือหลายรหัสไม่ต้องสลับรหัสไปมา) */
  const allPersonVdas = searchParams.get("allPersonVdas") === "true";

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
  const status = searchParams.get("status")?.trim();
  if (status && status !== "all" && isPoStatus(status)) where.status = status;

  // วันที่ล้วน (YYYY-MM-DD) = ทั้งวันตามเวลาไทย — เดิม new Date("YYYY-MM-DD") เป็นเที่ยงคืน UTC และ
  // setHours() ใช้โซนของเซิร์ฟเวอร์ ช่วงวันจึงเลื่อน 7 ชม. PO ที่ออกเช้าตรู่หลุดจากวันที่เลือก
  const dayBound = (d: string | null | undefined, end: boolean) => {
    if (!d) return null;
    const t = /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? new Date(`${d}T${end ? "23:59:59.999" : "00:00:00.000"}+07:00`)
      : new Date(d);
    return Number.isNaN(t.getTime()) ? null : t;
  };
  const from = dayBound(dateFrom, false);
  const to = dayBound(dateTo, true);
  if (from) {
    where.issuedAt = { ...(where.issuedAt as object), gte: from };
  }
  if (to) {
    where.issuedAt = { ...(where.issuedAt as object), lte: to };
  }

  if (session.role !== "admin") {
    const codes = resolveSalesmanCodesForFilter(session);
    let allowed: string[];
    if (allPersonVdas && session.role === "sales") {
      // ขอดูทุก VDA ของคนนี้ — รวมของทุกรหัสที่ถืออยู่ ไม่ใช่แค่รหัส active
      allowed = [
        ...new Set([
          ...resolveVdaCodesForSalesmanCodes(codes),
          ...resolveAllPersonVdaCodes(session.email, session.manualCodes),
        ]),
      ];
    } else {
      allowed = resolveVdaCodesForSalesmanCodes(codes);
      if (allowed.length === 0 && session.role === "sales") {
        allowed = resolveAllPersonVdaCodes(session.email, session.manualCodes);
      }
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
    // ขอ VDA นอกขอบเขต = 403 (เดิมเงียบแล้วคืนของ VDA ตัวเองแทน)
    if (vdaCode && !allowed.includes(vdaCode)) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ดู PO ของคลังนี้" }, { status: 403 });
    }
    const filtered = vdaCode ? [vdaCode] : allowed;
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
    status: po.status,
    statusAt: po.statusAt?.toISOString() ?? null,
    statusBy: po.statusBy,
    statusNote: po.statusNote,
    orderId: po.order.id,
    storeCode: po.order.store.code,
    storeName: po.order.store.name,
    siblingCount: po.order._count.purchaseOrders,
    erpSentAt: po.erpSentAt?.toISOString() ?? null,
    erpError: po.erpError,
    erpFailureKind: po.erpFailureKind,
    replacedByPoNumber: po.replacedByPoNumber,
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

/**
 * ลบ PO หลายใบรวดเดียว — `?poNumbers=A,B,C`
 *
 * ใช้ตอนล้างประวัติก่อนส่งให้ผู้ใช้ทดสอบ ทำงานเหมือน DELETE ของใบเดียวทุกอย่าง
 * คือลบออเดอร์ต้นทางทั้งใบ เลข PO ที่มาจากออเดอร์เดียวกันจึงถูกยุบเหลือครั้งเดียว
 */
export async function DELETE(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const previewBlock = salesPreviewReadOnly(session);
  if (previewBlock) return previewBlock;

  const { searchParams } = new URL(request.url);
  const poNumbers = (searchParams.get("poNumbers") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (poNumbers.length === 0) {
    return NextResponse.json({ error: "ต้องระบุเลข PO" }, { status: 400 });
  }
  if (poNumbers.length > MAX_DELETE_BATCH) {
    return NextResponse.json(
      { error: `ลบได้ครั้งละไม่เกิน ${MAX_DELETE_BATCH} ใบ` },
      { status: 400 }
    );
  }

  const { orderIds, missing } = await resolveOrderIdsForPoNumbers(poNumbers);
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "ไม่พบ PO ที่เลือก" }, { status: 404 });
  }

  const result = await deleteOrdersForSession(orderIds, session, {
    allowIssuedPo: true,
    notifyStores: searchParams.get("notify") !== "0",
  });
  if (result.deletedOrderIds.length === 0) {
    if (result.skipped.some((s) => s.reason === "in_erp")) {
      return NextResponse.json(
        {
          error:
            "ลบไม่ได้ — PO ที่เลือกส่งเข้า ERP แล้ว (หรือส่งแล้วผลไม่ชัดเจน) ต้องยกเลิกที่ฝั่ง ERP ก่อน",
          skipped: result.skipped,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์ลบ PO ที่เลือก" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedOrderIds: result.deletedOrderIds,
    deletedPoNumbers: result.deletedPoNumbers,
    // เลขที่หาไม่เจอ + ใบที่ไม่มีสิทธิ์ — บอกให้ผู้ใช้รู้ว่าไม่ได้ลบครบตามที่เลือก
    missing,
    skipped: result.skipped,
  });
}
