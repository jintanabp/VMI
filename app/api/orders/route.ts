import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import { exportToPoStub } from "@/lib/po/export-stub";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";
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

const orderItemSchema = z.object({
  skuId: z.string(),
  suggestedQty: z.number().int().min(0),
  finalQty: z.number().int().min(1),
  cvdEstimate: z.number().nullable(),
  minDays: z.number().int().nullable().optional(),
  maxDays: z.number().int().nullable().optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const storeId = searchParams.get("storeId") ?? undefined;
  const salesRepId = searchParams.get("salesRepId") ?? undefined;
  const vdaCode = searchParams.get("vdaCode") ?? undefined;
  const allPersonVdas = searchParams.get("allPersonVdas") === "true";

  const salesSession = await getSalesSession();
  const cookieStore = await cookies();
  const customerStoreId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;

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
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;

  if (!storeId) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (store && isVdaStoreCode(store.code)) {
    await ensureVdaStoreSalesRep(store.id, store.code);
  }

  const { orders } = getRepositories();
  const order = await orders.createOrder(storeId, parsed.data.items);
  const full = await orders.getOrderById(order.id);
  return NextResponse.json(full, { status: 201 });
}

export async function PATCH(request: Request) {
  const salesSession = await getSalesSession();
  if (!salesSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { orderId, action, reason, itemId, finalQty } = body;
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

  if (action === "approve") {
    const order = (await orders.approveOrder(orderId)) as {
      id: string;
      approvedAt: Date | null;
      store: { code: string };
      items: { finalQty: number; sku: { code: string } }[];
    };

    const payload = {
      orderId: order.id,
      storeCode: order.store.code,
      approvedAt: (order.approvedAt ?? new Date()).toISOString(),
      items: order.items.map((item) => ({
        skuCode: item.sku.code,
        qty: item.finalQty,
        unit: "case",
      })),
    };

    const filePath = await exportToPoStub(payload);
    return NextResponse.json({ order, poExportPath: filePath });
  }

  if (action === "reject") {
    const order = await orders.rejectOrder(orderId, reason);
    return NextResponse.json(order);
  }

  if (action === "updateQty" && itemId && finalQty) {
    await orders.updateOrderItemQty(orderId, itemId, finalQty);
    const order = await orders.getOrderById(orderId);
    return NextResponse.json(order);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
