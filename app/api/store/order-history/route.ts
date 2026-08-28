import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedStoreId } from "@/lib/auth/store-context";
import {
  calcNetUnitPrice,
  LEAD_TIME_DAYS,
  resolveOrderLinePrice,
} from "@/lib/calculations";
import {
  collectOwedFreeGoods,
  type OwedFreeGood,
} from "@/lib/promo/order-free-goods";

/** จำนวนออเดอร์ย้อนหลังสูงสุดที่ส่งกลับ — กัน payload บวมเมื่อร้านสั่งบ่อย */
const MAX_ORDERS = 100;
/** ช่วงวันเริ่มต้นของโหมด summary (ใช้เตือนสั่งซ้ำ) */
const DEFAULT_SUMMARY_DAYS = 14;

const resolveStoreId = getAuthorizedStoreId;

export interface OrderHistoryItem {
  skuId: string;
  skuCode: string;
  skuName: string;
  suggestedQty: number;
  finalQty: number;
  /** ราคา/หีบ ที่มีผลจริง (พนักงาน > ร้าน > C4) */
  unitPrice: number | null;
  /** ราคาแคตตาล็อก C4 ที่แช่ไว้ตอนส่ง — ใช้เทียบว่าราคาถูกแก้ไปเท่าไร */
  c4UnitPrice: number | null;
  /** ราคาหลังหักส่วนลด C4 */
  netUnitPrice: number | null;
  lineTotal: number | null;
  /** true = ราคาบรรทัดนี้ไม่ตรง C4 (ร้านหรือพนักงานแก้) */
  priceFlagged: boolean;
  /** true = พนักงานเป็นคนตั้งราคานี้ ไม่ใช่ร้าน */
  priceSetBySales: boolean;
  /**
   * สแนปช็อตโปร ณ เวลาสั่ง — null = ออเดอร์ก่อนมีฟีเจอร์นี้ (ไม่ใช่ "ไม่มีโปร")
   * ไม่คำนวณใหม่ตอนอ่าน เพราะแคมเปญเปลี่ยนแล้วจะได้โปรของวันนี้ ซึ่งผิด
   */
  promoLabel: string | null;
  promoGroup: string | null;
  promoGroupMembers: number | null;
  pooledQty: number | null;
  /** ของแถมของบรรทัดนี้ — โปรกลุ่มจะซ้ำทุกบรรทัด ใช้ order.freeGoods ที่ dedupe แล้วแทน */
  freeGood: {
    code: string;
    name: string;
    qty: number;
    unit: string;
  } | null;
}

export interface OrderHistoryEntry {
  id: string;
  createdAt: string;
  approvedAt: string | null;
  /** เวลาที่พนักงานตัดสิน (อนุมัติหรือปฏิเสธ) — ออเดอร์เก่า fallback ไป approvedAt */
  decidedAt: string | null;
  /** อีเมลพนักงานที่อนุมัติ/ปฏิเสธ */
  decidedBy: string;
  status: string;
  rejectReason: string | null;
  itemCount: number;
  /** จำนวนหีบรวมของออเดอร์ (finalQty) */
  totalQty: number;
  /** มูลค่ารวมของออเดอร์ — null เมื่อไม่มีราคาให้คิดเลยสักบรรทัด */
  orderTotal: number | null;
  /** เลข PO ที่ออกให้ออเดอร์นี้ — ร้านใช้อ้างอิงเวลาตามของ (1 ออเดอร์อาจได้หลาย PO) */
  poNumbers: string[];
  /** วันที่ออก PO ใบแรก — ใช้ทำ timeline */
  poIssuedAt: string | null;
  /** ของแถมทั้งออเดอร์ที่ dedupe โปรกลุ่มแล้ว — ห้ามบวกเองจาก items */
  freeGoods: OwedFreeGood[];
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
  /**
   * จำนวนหีบที่สั่งไปแล้วแต่ของยังไม่น่าจะถึงร้าน — ใช้หักออกจากจำนวนแนะนำ
   * ไม่งั้นหน้าสต็อกจะแนะนำซ้ำจนร้านสั่งเบิ้ล เพราะ stock_cover_day ยังไม่เห็นของ
   *
   * นับเมื่อ: ยังไม่อนุมัติ (ไม่ว่านานแค่ไหน — ยังไม่ได้ส่งเข้าคลังด้วยซ้ำ)
   *          หรือ อนุมัติแล้วแต่ยังไม่ครบ lead time
   * ไม่นับออเดอร์ที่อนุมัติเกิน lead time แล้ว เพราะของน่าจะเข้าสต็อกและถูกนับใน
   * stock_cover_day ไปแล้ว — หักซ้ำจะกลายเป็นแนะนำน้อยเกินจริง
   */
  pendingQty: number;
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
      items: {
        include: {
          sku: true,
          // สถานะ PO ราย "บรรทัด" — บรรทัดในออเดอร์เดียวกันอาจถูกแยกเป็นหลาย PO
          // และแต่ละใบมีชะตากรรมต่างกัน (ใบหนึ่งยกเลิก อีกใบของมาแล้ว)
          purchaseOrder: { select: { status: true } },
        },
      },
      purchaseOrders: { select: { poNumber: true, issuedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: summary ? undefined : MAX_ORDERS,
  });

  if (summary) {
    // ออเดอร์ที่ถูกปฏิเสธไม่นับว่า "สั่งไปแล้ว" — ร้านต้องสั่งใหม่ได้โดยไม่ถูกเตือน
    const bySku: Record<string, OrderHistorySummaryEntry> = {};
    const now = Date.now();
    for (const order of orders) {
      // ปฏิเสธ = ของจะไม่มา ต้องไม่นับว่า "สั่งไปแล้ว" และห้ามเอาไปหักจำนวนแนะนำ
      // ("cancelled" ไม่เคยถูกเขียนลง DB — ร้านยกเลิกคือลบแถวทิ้งที่
      // app/api/store/orders/route.ts — เก็บเงื่อนไขไว้เผื่อวันหนึ่งเปลี่ยนเป็น soft cancel)
      if (order.status === "rejected" || order.status === "cancelled") continue;
      const daysAgo = Math.floor(
        (now - order.createdAt.getTime()) / 86_400_000
      );
      const orderInFlight =
        order.status === "pending_approval" || daysAgo < LEAD_TIME_DAYS;
      for (const item of order.items) {
        const code = item.sku.code;
        // สถานะ PO ชนะการเดาจากปฏิทิน: ยกเลิก = ของไม่มาแน่ · รับของแล้ว = มาถึงแล้ว
        // (เข้า stock_cover_day เรียบร้อย) ทั้งสองกรณีต้องเลิกกดยอด "แนะนำ" ทันที
        // ไม่ใช่รอให้ครบ LEAD_TIME_DAYS แล้วร้านสั่งของไม่ได้ทั้งที่ควรสั่ง
        const poStatus = item.purchaseOrder?.status;
        const inFlight =
          poStatus === "cancelled" || poStatus === "received"
            ? false
            : orderInFlight;
        const existing = bySku[code];
        // orders เรียง createdAt desc อยู่แล้ว — ตัวแรกที่เจอคือครั้งล่าสุด
        if (existing) {
          existing.totalQty += item.finalQty;
          existing.orderCount += 1;
          if (inFlight) existing.pendingQty += item.finalQty;
          continue;
        }
        bySku[code] = {
          totalQty: item.finalQty,
          lastQty: item.finalQty,
          orderedAt: order.createdAt.toISOString(),
          status: order.status,
          daysAgo,
          orderCount: 1,
          pendingQty: inFlight ? item.finalQty : 0,
        };
      }
    }
    return NextResponse.json({ days: days ?? DEFAULT_SUMMARY_DAYS, bySku });
  }

  const entries: OrderHistoryEntry[] = orders.map((order) => {
    const items: OrderHistoryItem[] = order.items.map((i) => {
      // ลำดับราคาเดียวกับที่ใช้ตอนออก PO — พนักงาน > ร้าน > แคตตาล็อก C4
      const { unitPrice, source } = resolveOrderLinePrice({
        salesPriceOverride: i.salesPriceOverride,
        unitPriceOverride: i.unitPriceOverride,
        c4UnitPrice: i.c4UnitPrice,
      });
      // ส่วนลด C4 คิดทับบนราคาที่มีผล ไม่ใช่ c4NetUnitPrice ที่คิดจากราคาแคตตาล็อก
      const netUnitPrice =
        calcNetUnitPrice(unitPrice, i.c4DiscountBaht, i.c4DiscountPct) ??
        unitPrice;
      return {
        skuId: i.skuId,
        skuCode: i.sku.code,
        skuName: i.sku.name,
        suggestedQty: i.suggestedQty,
        finalQty: i.finalQty,
        unitPrice,
        c4UnitPrice: i.c4UnitPrice,
        netUnitPrice,
        lineTotal: netUnitPrice != null ? netUnitPrice * i.finalQty : null,
        priceFlagged: i.priceFlagged,
        priceSetBySales: source === "sales",
        promoLabel: i.c4PromoLabel,
        promoGroup: i.c4PromoGroup,
        promoGroupMembers: i.c4PromoGroupMembers,
        pooledQty: i.c4PooledQty,
        freeGood: i.c4FreeGoodCode
          ? {
              code: i.c4FreeGoodCode,
              name: i.c4FreeGoodName || i.c4FreeGoodCode,
              qty: i.c4FreeGoodQty ?? 0,
              unit: i.c4FreeGoodUnit ?? "",
            }
          : null,
      };
    });
    const withPrice = items.filter((i) => i.lineTotal != null);
    const pos = order.purchaseOrders ?? [];
    return {
      id: order.id,
      createdAt: order.createdAt.toISOString(),
      approvedAt: order.approvedAt?.toISOString() ?? null,
      decidedAt: order.decidedAt?.toISOString() ?? null,
      decidedBy: order.decidedBy,
      status: order.status,
      rejectReason: order.rejectReason,
      itemCount: order.items.length,
      totalQty: order.items.reduce((s, i) => s + i.finalQty, 0),
      orderTotal:
        withPrice.length > 0
          ? withPrice.reduce((s, i) => s + (i.lineTotal ?? 0), 0)
          : null,
      poNumbers: pos
        .map((po) => po.poNumber)
        .sort((a, b) => a.localeCompare(b)),
      poIssuedAt:
        pos.length > 0
          ? new Date(
              Math.min(...pos.map((po) => po.issuedAt.getTime()))
            ).toISOString()
          : null,
      // ส่ง finalQty เป็น qty ให้ตัวรวมของแถมด้วย — บรรทัดที่พนักงานตัดเหลือ 0
      // ไม่ควรขึ้นว่าร้านยังได้ของแถมของบรรทัดนั้น
      freeGoods: collectOwedFreeGoods(
        items.map((i) => ({ ...i, qty: i.finalQty }))
      ),
      items,
    };
  });

  return NextResponse.json({ orders: entries, truncated: orders.length >= MAX_ORDERS });
}
