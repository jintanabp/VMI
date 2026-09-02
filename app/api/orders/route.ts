import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import { approveWithPoSplit } from "@/lib/po/approve-with-split";
import { notifyStore } from "@/lib/orders/store-notify";
import { notifySales } from "@/lib/orders/sales-notify";
import {
  getAuthorizedStore,
  getAuthorizedStoreId,
} from "@/lib/auth/store-context";
import { evaluatePriceOverride } from "@/lib/calculations";
import {
  lookupOrderPromoLines,
  type OrderPromoLineResult,
} from "@/lib/promo/lookup-order-lines";
import type { OrderItemInput } from "@/lib/repositories/types";
import { getSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";
import { ensureVdaStoreSalesRep } from "@/lib/fabric/ensure-vda-sales-rep";
import { isVdaStoreCode } from "@/lib/fabric/vda-aos-bill";
import {
  assertOrderAccess,
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";
import {
  deleteOrdersForSession,
  MAX_DELETE_BATCH,
} from "@/lib/orders/delete-orders";

const orderItemSchema = z.object({
  skuId: z.string(),
  suggestedQty: z.number().int().min(0),
  finalQty: z.number().int().min(1),
  cvdEstimate: z.number().nullable(),
  minDays: z.number().int().nullable().optional(),
  maxDays: z.number().int().nullable().optional(),
  // ราคาที่ร้านแก้เอง — รับแค่ตัวนี้ ที่เหลือเซิร์ฟเวอร์คำนวณเอง (client ประกาศ "ไม่ flagged" ไม่ได้)
  // .finite() จำเป็น: JSON.parse('{"x":1e999}') ได้ Infinity ซึ่ง z.number() ปล่อยผ่าน
  unitPriceOverride: z
    .number()
    .finite()
    .min(0)
    .max(1_000_000)
    .nullable()
    .optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  /**
   * รหัสประจำดราฟต์จาก client — กดส่งซ้ำ/เน็ต retry ด้วยรหัสเดิมจะได้ใบเดิม
   * ไม่บังคับ เพื่อให้ client เวอร์ชันเก่าที่ยังเปิดค้างอยู่ส่งออเดอร์ได้ตามปกติ
   */
  clientRequestId: z.string().trim().min(8).max(64).optional(),
});

// PATCH เดิมเป็น destructure ดิบ ๆ จาก request.json() — ไม่ validate อะไรเลย
// และ `&& finalQty` ทำให้ finalQty:0 ตกไปที่ "Invalid action" แทนที่จะถูกปฏิเสธชัด ๆ
const patchOrderSchema = z.discriminatedUnion("action", [
  z.object({
    orderId: z.string().min(1),
    action: z.literal("approve"),
    /** เลข PO ที่พนักงานพิมพ์ทับต่อกลุ่ม (ไม่ส่ง = ให้ระบบ mint เอง) */
    poNumbers: z.record(z.string(), z.string().trim().max(12)).optional(),
  }),
  z.object({
    orderId: z.string().min(1),
    action: z.literal("reject"),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    orderId: z.string().min(1),
    action: z.literal("updateQty"),
    itemId: z.string().min(1),
    finalQty: z.number().int().min(0).max(100_000),
  }),
  z.object({
    orderId: z.string().min(1),
    action: z.literal("updatePrice"),
    itemId: z.string().min(1),
    // .finite() จำเป็น: JSON.parse('{"x":1e999}') ได้ Infinity ซึ่ง z.number() ปล่อยผ่าน
    unitPriceOverride: z
      .number()
      .finite()
      .min(0)
      .max(1_000_000)
      .nullable(),
  }),
  z.object({
    orderId: z.string().min(1),
    action: z.literal("assignPoGroup"),
    assignments: z
      .array(
        z.object({
          itemId: z.string().min(1),
          poGroup: z.string().trim().regex(/^[A-Z]$/, "กลุ่ม PO ต้องเป็น A-Z"),
        })
      )
      .min(1)
      .max(500),
  }),
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const storeId = searchParams.get("storeId") ?? undefined;
  const salesRepId = searchParams.get("salesRepId") ?? undefined;
  const vdaCode = searchParams.get("vdaCode") ?? undefined;
  const allPersonVdas = searchParams.get("allPersonVdas") === "true";

  const salesSession = await getSalesSession();
  const customerStoreId = await getAuthorizedStoreId();

  const { orders } = getRepositories();

  if (salesSession) {
    const email = salesSession.email;
    const role = salesSession.role;

    if (role === "admin") {
      const list = await orders.listOrders({
        status,
        storeId,
        salesRepId: salesRepId || undefined,
        storeCode: vdaCode || undefined,
      });
      return NextResponse.json(list);
    }

    const salesmanCodes = resolveSalesmanCodesForFilter(salesSession);
    const allowedVdas =
      allPersonVdas && role === "sales"
        ? resolveAllPersonVdaCodes(email)
        : resolveVdaCodesForSalesmanCodes(salesmanCodes);
    const requestedVda = vdaCode?.trim().toLowerCase();

    if (allowedVdas.length > 0) {
      const filterVdas =
        requestedVda && allowedVdas.includes(requestedVda)
          ? [requestedVda]
          : allowedVdas;

      const list = await orders.listOrders({
        status,
        storeId,
        vdaCodes: filterVdas,
      });
      return NextResponse.json(list);
    }

    if (role === "sales") {
      return NextResponse.json([]);
    }

    const filters =
      role === "manager" || role === "supervisor"
        ? {
            status,
            storeId,
            salesRepEmails: salesSession.scopeEmails ?? [email],
          }
        : { status, storeId, salesRepEmail: email };

    const list = await orders.listOrders(filters);
    return NextResponse.json(list);
  }

  if (customerStoreId) {
    const list = await orders.listOrders({ storeId: customerStoreId, status });
    return NextResponse.json(list);
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const authorized = await getAuthorizedStore();
  if (!authorized) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 401 });
  }
  const { storeId } = authorized;

  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (store && isVdaStoreCode(store.code)) {
    await ensureVdaStoreSalesRep(store.id, store.code);
  }

  const items = parsed.data.items;

  // ตัดสินธง "ราคาไม่ตรง C4" ฝั่งเซิร์ฟเวอร์ตอนส่ง แล้วแช่ค่าที่ใช้เทียบไว้
  // — ราคา master เปลี่ยนรายวัน ถ้าคำนวณใหม่ตอนอ่าน ธงจะกระพริบและพิสูจน์ย้อนหลังไม่ได้
  const skus = await prisma.sku.findMany({
    where: { id: { in: items.map((i) => i.skuId) } },
    select: { id: true, code: true },
  });
  const codeById = new Map(skus.map((s) => [s.id, s.code]));

  const storeCode = store?.code ?? authorized.storeCode ?? "";

  let c4BySku: Map<string, OrderPromoLineResult> | null = null;
  try {
    const lookup = lookupOrderPromoLines(
      storeCode,
      items.map((i) => ({
        skuCode: codeById.get(i.skuId) ?? "",
        qty: i.finalQty,
      }))
    );
    c4BySku = new Map(lookup.lines.map((l) => [l.skuCode, l]));
  } catch {
    // PROMO_NOT_LOADED — ยืนยันราคาไม่ได้ ให้ธงเป็น "unverified" แทนที่จะเงียบ
    c4BySku = null;
  }

  const enrichedItems: OrderItemInput[] = items.map((i) => {
    const c4 = c4BySku?.get(codeById.get(i.skuId) ?? "") ?? null;
    const verdict = evaluatePriceOverride({
      override: i.unitPriceOverride ?? null,
      c4UnitPrice: c4?.unitPrice ?? null,
      promoLoaded: c4BySku != null,
    });
    // แช่โปร + ของแถมไว้ด้วย — ข้อมูลชุดนี้อยู่ใน c4 อยู่แล้วแต่เดิมถูกทิ้ง
    // ทำให้พิสูจน์ย้อนหลังไม่ได้ว่าตอนร้านกดส่ง ระบบบอกว่าจะได้ของแถมอะไร
    // (โปรกลุ่มจะได้ freeGood ตัวเดียวกันทุกบรรทัดในกลุ่ม — ตั้งใจเก็บตามนั้น
    //  ให้ฝั่งอ่าน dedupe ด้วย c4PromoGroup ไม่งั้น snapshot จะไม่ตรงกับที่ร้านเห็น)
    const free = c4?.freeGood ?? null;
    return {
      ...i,
      unitPriceOverride: verdict.override,
      c4UnitPrice: c4?.unitPrice ?? null,
      c4DiscountBaht: c4?.discountBaht ?? null,
      c4DiscountPct: c4?.discountPct ?? null,
      c4NetUnitPrice: c4?.netUnitPrice ?? null,
      c4PriceExpired: c4?.priceExpired ?? null,
      priceFlagged: verdict.flagged,
      priceFlagReason: verdict.reason,
      c4PromoLabel: c4?.currentPromo ?? null,
      c4PromoKind: c4?.currentKind ?? null,
      c4PromoGroup: c4?.promoGroup ?? null,
      c4PromoGroupMembers: c4?.promoGroupMembers ?? null,
      c4PooledQty: c4?.pooledQty ?? null,
      c4FreeGoodCode: free?.premiumProduct ?? null,
      c4FreeGoodName: free?.premiumName ?? null,
      c4FreeGoodQty: free?.qty ?? null,
      c4FreeGoodUnit: free?.unitLabel ?? null,
    };
  });

  const { orders } = getRepositories();
  const order = await orders.createOrder(
    storeId,
    enrichedItems,
    parsed.data.clientRequestId
  );

  // ส่งซ้ำใบเดิม — คืนใบเดิมเงียบ ๆ ห้ามเด้งแจ้งเตือนเซลล์ซ้ำ
  if (order.reused) {
    return NextResponse.json(await orders.getOrderById(order.id), {
      status: 200,
    });
  }

  const totalQty = items.reduce((s, i) => s + i.finalQty, 0);
  const flaggedCount = enrichedItems.filter((i) => i.priceFlagged).length;
  await notifySales({
    storeId,
    kind: "order_created",
    title: `${storeCode || store?.name || "ร้านค้า"} ส่งคำสั่งซื้อใหม่`,
    detail:
      `${items.length} รายการ · ${totalQty} หีบ` +
      (flaggedCount > 0 ? ` · มีราคาไม่ตรง C4 ${flaggedCount} รายการ` : ""),
    orderId: order.id,
  });

  const full = await orders.getOrderById(order.id);
  return NextResponse.json(full, { status: 201 });
}

/**
 * ค่าเดิมของบรรทัดก่อนพนักงานแก้ — ใช้เขียนข้อความแจ้งเตือนให้ร้านรู้ว่า
 * "สินค้าตัวไหน จากเท่าไร เป็นเท่าไร" แทนข้อความรวม ๆ ที่ไม่บอกว่าแตะรายการใด
 * คืน null เมื่อหาไม่เจอ — คนเรียกยังเดินต่อได้ด้วยข้อความแบบเดิม
 */
async function snapshotOrderItem(orderId: string, itemId: string) {
  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId },
    select: {
      finalQty: true,
      c4UnitPrice: true,
      salesPriceOverride: true,
      unitPriceOverride: true,
      sku: { select: { code: true, name: true } },
    },
  });
  if (!item) return null;
  return {
    skuCode: item.sku.code,
    skuName: item.sku.name,
    finalQty: item.finalQty,
    c4UnitPrice: item.c4UnitPrice,
    /** ราคาที่มีผลอยู่ก่อนแก้: พนักงาน > ร้าน > C4 */
    effectivePrice:
      item.salesPriceOverride ?? item.unitPriceOverride ?? item.c4UnitPrice,
  };
}

export async function PATCH(request: Request) {
  const salesSession = await getSalesSession();
  if (!salesSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }
  const body = parsed.data;
  const { orderId, action } = body;
  const { orders } = getRepositories();

  try {
    await assertOrderAccess(orderId, salesSession);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    if (msg === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    }
    return NextResponse.json({ error: "ไม่มีสิทธิ์จัดการออเดอร์นี้" }, { status: 403 });
  }

  // approve/reject ไม่เคยเช็คสถานะเดิม — ยิง PATCH ซ้ำได้เรื่อย ๆ ทับ approvedAt
  // และเขียนไฟล์ PO ใหม่ทุกครั้ง หรือพลิก approved → rejected ย้อนหลังได้
  // การแก้ราคา/จัดกลุ่ม PO ก็ต้องทำได้เฉพาะตอนยังรออนุมัติเช่นกัน
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, storeId: true },
  });
  if (!order) {
    return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  }
  const current = order;
  if (current.status !== "pending_approval") {
    return NextResponse.json(
      {
        error:
          current.status === "approved"
            ? "ออเดอร์นี้อนุมัติแล้ว"
            : "ออเดอร์นี้ถูกปฏิเสธแล้ว",
        status: current.status,
      },
      { status: 409 }
    );
  }

  if (action === "approve") {
    try {
      const result = await approveWithPoSplit(
        orderId,
        salesSession.email,
        body.poNumbers ?? {}
      );
      const pos = result.purchaseOrders;
      const totalQty = pos.reduce((s, po) => s + po.totalQty, 0);
      const totalItems = pos.reduce((s, po) => s + po.itemCount, 0);
      await notifyStore({
        storeId: order.storeId,
        kind: "approved",
        title: "อนุมัติคำสั่งซื้อแล้ว",
        detail: `รวม ${totalItems} รายการ · ${totalQty} หีบ`,
        poNumbers: pos.map((po) => po.poNumber),
        orderId,
        actorEmail: salesSession.email,
      });
      // แยกเป็นอีกใบ เพราะ "อนุมัติ" กับ "ออกเลข PO" เป็นคนละข้อมูลที่ร้านใช้คนละเรื่อง
      // (อันหลังเอาไว้อ้างอิงตอนรับของ) และเวลาแบ่งหลายใบต้องเห็นยอดแยกรายใบ
      await notifyStore({
        storeId: order.storeId,
        kind: "po_issued",
        title:
          pos.length > 1 ? `ออก PO แล้ว ${pos.length} ใบ` : "ออก PO แล้ว",
        detail: pos
          .map(
            (po) =>
              `${po.poNumber} · ${po.label} · ${po.itemCount} รายการ ${po.totalQty} หีบ`
          )
          .join(" | "),
        poNumbers: pos.map((po) => po.poNumber),
        orderId,
        actorEmail: salesSession.email,
      });
      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ";
      // อีกคนชิงตัดสินไปก่อน (approve/reject พร้อมกัน) — compare-and-set กันไว้แล้ว
      if (msg === "ORDER_ALREADY_DECIDED") {
        return NextResponse.json(
          { error: "ออเดอร์นี้ถูกตัดสินไปแล้วโดยคนอื่น", status: "decided" },
          { status: 409 }
        );
      }
      if (msg.startsWith("SPLIT_INVALID:")) {
        return NextResponse.json(
          { error: "แบ่ง PO ไม่ถูกต้อง", issues: msg.slice(14).split("\n") },
          { status: 422 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (action === "reject") {
    let rejected;
    try {
      rejected = await orders.rejectOrder(
        orderId,
        body.reason,
        salesSession.email
      );
    } catch (err) {
      // อีกคนชิงอนุมัติ/ปฏิเสธไปก่อน — compare-and-set ใน rejectOrder กันไว้
      if (err instanceof Error && err.message === "ORDER_ALREADY_DECIDED") {
        return NextResponse.json(
          { error: "ออเดอร์นี้ถูกตัดสินไปแล้วโดยคนอื่น", status: "decided" },
          { status: 409 }
        );
      }
      throw err;
    }
    await notifyStore({
      storeId: order.storeId,
      kind: "rejected",
      title: "คำสั่งซื้อถูกปฏิเสธ",
      detail: body.reason?.trim() || "ไม่ได้ระบุเหตุผล",
      orderId,
      actorEmail: salesSession.email,
    });
    return NextResponse.json(rejected);
  }

  if (action === "updatePrice") {
    // อ่านค่าเดิมก่อนแก้ เพื่อบอกร้านได้ว่า "รายการไหน จากเท่าไร เป็นเท่าไร"
    // (เดิมแจ้งแค่ราคาใหม่ ร้านไม่รู้ว่าเป็นสินค้าตัวไหนในออเดอร์)
    const before = await snapshotOrderItem(orderId, body.itemId);
    try {
      await orders.updateOrderItemPrice(
        orderId,
        body.itemId,
        body.unitPriceOverride,
        salesSession.email
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "ORDER_ITEM_NOT_FOUND") {
        return NextResponse.json(
          { error: "ไม่พบรายการนี้ในออเดอร์" },
          { status: 404 }
        );
      }
      throw err;
    }
    const priceLabel = before ? `${before.skuCode} ${before.skuName} · ` : "";
    const oldPrice = before?.effectivePrice ?? null;
    await notifyStore({
      storeId: order.storeId,
      kind: "price_changed",
      title: "พนักงานปรับราคาในคำสั่งซื้อ",
      detail:
        body.unitPriceOverride == null
          ? `${priceLabel}ยกเลิกราคาที่ตั้งไว้ กลับไปใช้ราคาระบบ${
              before?.c4UnitPrice != null
                ? ` (${before.c4UnitPrice} บาท/หีบ)`
                : ""
            }`
          : `${priceLabel}${
              oldPrice != null ? `${oldPrice} → ` : ""
            }${body.unitPriceOverride} บาท/หีบ`,
      orderId,
      actorEmail: salesSession.email,
    });
    return NextResponse.json(await orders.getOrderById(orderId));
  }

  if (action === "assignPoGroup") {
    await orders.assignPoGroups(orderId, body.assignments);
    return NextResponse.json(await orders.getOrderById(orderId));
  }

  if (action === "updateQty") {
    const before = await snapshotOrderItem(orderId, body.itemId);
    try {
      await orders.updateOrderItemQty(orderId, body.itemId, body.finalQty);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "ORDER_ITEM_NOT_FOUND") {
        return NextResponse.json(
          { error: "ไม่พบรายการนี้ในออเดอร์" },
          { status: 404 }
        );
      }
      throw err;
    }
    await notifyStore({
      storeId: order.storeId,
      kind: "qty_changed",
      title: "พนักงานปรับจำนวนในคำสั่งซื้อ",
      detail: before
        ? `${before.skuCode} ${before.skuName} · ${before.finalQty} → ${body.finalQty} หีบ`
        : `ปรับเป็น ${body.finalQty} หีบ`,
      orderId,
      actorEmail: salesSession.email,
    });
    return NextResponse.json(await orders.getOrderById(orderId));
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * พนักงานลบคำสั่งซื้อ — ทีละใบ (`?orderId=`) หรือหลายใบ (`?orderIds=a,b,c`)
 *
 * ค่าเริ่มต้นยังลบได้เฉพาะที่ยังไม่ออก PO เพื่อกันเผลอลบใบที่ส่งต่อฝ่ายจัดซื้อไปแล้ว
 * ต้องส่ง `?withPo=1` มาด้วยถึงจะลบใบที่ออก PO แล้ว — ฝั่ง UI ใช้ตอนล้างประวัติ
 * ก่อนส่งให้ผู้ใช้ทดสอบ และต้องบอกในกล่องยืนยันว่า PO จะหายไปกี่ใบ
 *
 * `?notify=0` = ลบเงียบ ๆ ไม่เขียนแจ้งเตือนใบใหม่ให้ร้าน (โหมดล้างประวัติ)
 */
export async function DELETE(request: Request) {
  const salesSession = await getSalesSession();
  if (!salesSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const single = searchParams.get("orderId")?.trim() ?? "";
  const many = (searchParams.get("orderIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const orderIds = [...new Set(single ? [single, ...many] : many)];

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });
  }
  if (orderIds.length > MAX_DELETE_BATCH) {
    return NextResponse.json(
      { error: `ลบได้ครั้งละไม่เกิน ${MAX_DELETE_BATCH} ใบ` },
      { status: 400 }
    );
  }

  const result = await deleteOrdersForSession(orderIds, salesSession, {
    allowIssuedPo: searchParams.get("withPo") === "1",
    notifyStores: searchParams.get("notify") !== "0",
  });

  // ใบเดียวแล้วลบไม่ได้ → ตอบเป็น error ตรง ๆ ให้ UI เดิมโชว์ข้อความได้เหมือนก่อน
  if (orderIds.length === 1 && result.deletedOrderIds.length === 0) {
    const reason = result.skipped[0]?.reason;
    if (reason === "not_found") {
      return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    }
    if (reason === "has_po") {
      return NextResponse.json(
        {
          error:
            "ออเดอร์นี้ออก PO ไปแล้ว — ถ้าต้องลบจริง ให้ยืนยันลบพร้อม PO อีกครั้ง",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์จัดการออเดอร์นี้" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedId: result.deletedOrderIds[0] ?? null,
    deletedIds: result.deletedOrderIds,
    deletedPoNumbers: result.deletedPoNumbers,
    skipped: result.skipped,
  });
}
