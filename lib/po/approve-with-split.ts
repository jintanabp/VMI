import { prisma } from "@/lib/prisma";
import { getRepositories } from "@/lib/repositories";
import { calcNetUnitPrice, resolveOrderLinePrice } from "@/lib/calculations";
import { resolveVdaStoreName } from "@/lib/fabric/vda-store-name";
import {
  buildBasePoNumber,
  buildChildPoNumber,
  checkPoNumberFormat,
  sanitizePoNumber,
  vdaPoPrefix,
} from "./po-number";
import { nextPoSequence } from "./po-sequence";
import { buildPoDocument, writePoDocument } from "./po-document";
import {
  proposePoSplit,
  validatePoSplit,
  type SplittableItem,
} from "./split-plan";
import type { PurchaseOrderInput } from "@/lib/repositories/types";

/**
 * อนุมัติออเดอร์แล้วออก PO ตามกลุ่มที่จัดไว้
 *
 * ลำดับสำคัญ: ตรวจการแบ่งก่อน → mint เลข → เขียนเอกสาร → เพิ่งเปลี่ยนสถานะ
 * ถ้าตรวจไม่ผ่านต้องไม่แตะสถานะออเดอร์เลย
 */
export interface ApproveWithSplitResult {
  order: unknown;
  purchaseOrders: {
    poNumber: string;
    groupKey: string;
    label: string;
    priceKind: string;
    itemCount: number;
    totalQty: number;
    totalAmount: number;
    exportPath: string;
  }[];
}

export async function approveWithPoSplit(
  orderId: string,
  actorEmail: string,
  poNumberOverrides: Record<string, string>
): Promise<ApproveWithSplitResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: true,
      items: { include: { sku: true } },
    },
  });
  if (!order) throw new Error("ไม่พบออเดอร์");
  if (order.items.length === 0) throw new Error("ออเดอร์นี้ไม่มีรายการสินค้า");

  const splittable: SplittableItem[] = order.items.map((item) => {
    const { unitPrice } = resolveOrderLinePrice({
      salesPriceOverride: item.salesPriceOverride,
      unitPriceOverride: item.unitPriceOverride,
      c4UnitPrice: item.c4UnitPrice,
    });
    return {
      id: item.id,
      skuCode: item.sku.code,
      skuName: item.sku.name,
      finalQty: item.finalQty,
      priceFlagged: item.priceFlagged,
      // ส่วนลด C4 คิดทับบน "ราคาที่มีผล" — ห้ามใช้ c4NetUnitPrice ตรง ๆ
      // เพราะนั่นคิดจากราคาแคตตาล็อก ทำให้ราคาที่ร้าน/เซลส์ตั้งไว้หายไป
      effectiveUnitPrice:
        calcNetUnitPrice(unitPrice, item.c4DiscountBaht, item.c4DiscountPct) ??
        unitPrice,
      poGroup: item.poGroup,
    };
  });

  const issues = validatePoSplit(splittable);
  if (issues.length > 0) {
    throw new Error(`SPLIT_INVALID:${issues.join("\n")}`);
  }

  const groups = proposePoSplit(splittable);
  if (groups.length === 0) throw new Error("ไม่มีกลุ่ม PO ที่จะออก");

  // เลขแม่ mint ครั้งเดียวต่อออเดอร์ — เลขลูกต่อ suffix เฉพาะเมื่อมีการแบ่งจริง
  const now = new Date();
  const storeCode = order.store.code;
  const seq = await nextPoSequence(storeCode, now);
  const base = buildBasePoNumber(vdaPoPrefix(storeCode), now, seq);
  const single = groups.length === 1;

  const storeName = resolveVdaStoreName(storeCode) || order.store.name;
  const itemById = new Map(order.items.map((i) => [i.id, i]));

  const toCreate: PurchaseOrderInput[] = [];
  const summary: ApproveWithSplitResult["purchaseOrders"] = [];

  for (const g of groups) {
    const manual = poNumberOverrides[g.groupKey]?.trim();
    let poNumber: string;
    if (manual) {
      poNumber = sanitizePoNumber(manual);
      checkPoNumberFormat(poNumber);
    } else {
      poNumber = single ? base : buildChildPoNumber(base, g.groupKey);
    }

    const doc = buildPoDocument({
      poNumber,
      groupKey: g.groupKey,
      priceKind: g.priceKind,
      orderId,
      storeCode,
      storeName,
      approvedAt: now,
      approvedBy: actorEmail,
      lines: g.itemIds.map((id) => {
        const item = itemById.get(id)!;
        const { unitPrice, source } = resolveOrderLinePrice({
          salesPriceOverride: item.salesPriceOverride,
          unitPriceOverride: item.unitPriceOverride,
          c4UnitPrice: item.c4UnitPrice,
        });
        return {
          skuCode: item.sku.code,
          skuName: item.sku.name,
          qty: item.finalQty,
          unit: "case" as const,
          unitPrice,
          priceSource: source,
          discountBaht: item.c4DiscountBaht,
          discountPct: item.c4DiscountPct,
          // ส่วนลด C4 คิดทับบนราคาที่ตั้งเอง — ร้าน/พนักงานโต้แย้งราคาแคตตาล็อกได้
          // แต่ปั้นขั้นโปรเองไม่ได้
          netUnitPrice:
            calcNetUnitPrice(
              unitPrice,
              item.c4DiscountBaht,
              item.c4DiscountPct
            ) ?? unitPrice,
          promoGroup: null,
          priceFlagged: item.priceFlagged,
          priceFlagReason: item.priceFlagReason,
        };
      }),
    });

    const exportPath = await writePoDocument(doc);

    toCreate.push({
      groupKey: g.groupKey,
      poNumber,
      priceKind: g.priceKind,
      itemIds: g.itemIds,
      totalQty: doc.totalQty,
      totalAmount: doc.totalAmount,
      exportPath,
      issuedBy: actorEmail,
    });
    summary.push({
      poNumber,
      groupKey: g.groupKey,
      label: g.label,
      priceKind: g.priceKind,
      itemCount: doc.itemCount,
      totalQty: doc.totalQty,
      totalAmount: doc.totalAmount,
      exportPath,
    });
  }

  const { orders } = getRepositories();
  await orders.createPurchaseOrders(orderId, toCreate);
  const approved = await orders.approveOrder(orderId, actorEmail);

  return { order: approved, purchaseOrders: summary };
}
