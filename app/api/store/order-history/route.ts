import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStoreSession } from "@/lib/auth/store-session";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";

/** จำนวนออเดอร์ย้อนหลังสูงสุดที่ส่งกลับ — กัน payload บวมเมื่อร้านสั่งบ่อย */
const MAX_ORDERS = 100;
/** ช่วงวันเริ่มต้นของโหมด summary (ใช้เตือนสั่งซ้ำ) */
const DEFAULT_SUMMARY_DAYS = 14;

async function resolveStoreId(): Promise<string | null> {
  const session = await getStoreSession();
  if (session) return session.storeId;
  const cookieStore = await cookies();
  return cookieStore.get(CUSTOMER_STORE_COOKIE)?.value ?? null;
}

export interface OrderHistoryItem {
  skuId: string;
  skuCode: string;
  skuName: string;
  suggestedQty: number;
  finalQty: number;
}

export interface OrderHistoryEntry {
  id: string;
  createdAt: string;
  approvedAt: string | null;
  status: string;
  rejectReason: string | null;
  itemCount: number;
  /** จำนวนหีบรวมของออเดอร์ (finalQty) */
  totalQty: number;
  /** เลข PO ที่ออกให้ออเดอร์นี้ — ร้านใช้อ้างอิงเวลาตามของ (1 ออเดอร์อาจได้หลาย PO) */
  poNumbers: string[];
  items: OrderHistoryItem[];
}

/** สรุปต่อ SKU สำหรับเตือน "สั่งไปแล้ว" ในตาราง stock */
export interface OrderHistorySummaryEntry {
  /** รวมจำนวนหีบที่สั่งในช่วงที่ดู */
  totalQty: number;
  /** จำนวนหีบของครั้งล่าสุด */
  lastQty: number;
  /** เวลาที่สั่งครั้งล่าสุด */
  orderedAt: string;
  /** สถานะของออเดอร์ครั้งล่าสุด */
  status: string;
  daysAgo: number;
  /** จำนวนออเดอร์ที่มี SKU นี้ในช่วงที่ดู */
  orderCount: number;
}

export async function GET(request: Request) {
  const storeId = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const summary = searchParams.get("summary") === "1";
  const daysParam = Number.parseInt(searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : null;

  const where: { storeId: string; createdAt?: { gte: Date } } = { storeId };
  const since = days
    ? new Date(Date.now() - days * 86_400_000)
    : summary
      ? new Date(Date.now() - DEFAULT_SUMMARY_DAYS * 86_400_000)
      : null;
  if (since) where.createdAt = { gte: since };

  const orders = await prisma.order.findMany({
    where,
    include: {
      items: { include: { sku: true } },
      purchaseOrders: { select: { poNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: summary ? undefined : MAX_ORDERS,
  });

  if (summary) {
    // ออเดอร์ที่ถูกปฏิเสธไม่นับว่า "สั่งไปแล้ว" — ร้านต้องสั่งใหม่ได้โดยไม่ถูกเตือน
    const bySku: Record<string, OrderHistorySummaryEntry> = {};
    const now = Date.now();
    for (const order of orders) {
      if (order.status === "rejected") continue;
      for (const item of order.items) {
        const code = item.sku.code;
        const existing = bySku[code];
        // orders เรียง createdAt desc อยู่แล้ว — ตัวแรกที่เจอคือครั้งล่าสุด
        if (existing) {
          existing.totalQty += item.finalQty;
          existing.orderCount += 1;
          continue;
        }
        bySku[code] = {
          totalQty: item.finalQty,
          lastQty: item.finalQty,
          orderedAt: order.createdAt.toISOString(),
          status: order.status,
          daysAgo: Math.floor((now - order.createdAt.getTime()) / 86_400_000),
          orderCount: 1,
        };
      }
    }
    return NextResponse.json({ days: days ?? DEFAULT_SUMMARY_DAYS, bySku });
  }

  const entries: OrderHistoryEntry[] = orders.map((order) => ({
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    approvedAt: order.approvedAt?.toISOString() ?? null,
    status: order.status,
    rejectReason: order.rejectReason,
    itemCount: order.items.length,
    totalQty: order.items.reduce((s, i) => s + i.finalQty, 0),
    poNumbers: (order.purchaseOrders ?? [])
      .map((po) => po.poNumber)
      .sort((a, b) => a.localeCompare(b)),
    items: order.items.map((i) => ({
      skuId: i.skuId,
      skuCode: i.sku.code,
      skuName: i.sku.name,
      suggestedQty: i.suggestedQty,
      finalQty: i.finalQty,
    })),
  }));

  return NextResponse.json({ orders: entries, truncated: orders.length >= MAX_ORDERS });
}
