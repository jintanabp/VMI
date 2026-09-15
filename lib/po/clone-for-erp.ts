import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bangkokDateStr } from "@/lib/fabric/bkk-date";
import { resolveVdaStoreName } from "@/lib/fabric/vda-store-name";
import { buildBasePoNumber, groupKeyAt, vdaPoPrefix } from "./po-number";
import { nextPoSequence } from "./po-sequence";
import { buildPoDocument, writePoDocument } from "./po-document";
import { orderItemToDocLine } from "./order-item-doc-line";
import type { PoPriceKind } from "./split-plan";

/**
 * ขอเลขใหม่ให้ใบที่ ERP ปฏิเสธไปแล้ว — ทำตามแนวเดียวกับ ocr-po-matching (clone-for-erp)
 *
 * เหตุผลที่ต้อง**สร้างใบใหม่**แทน "แก้แล้วส่งเลขเดิมซ้ำ": คู่ orderNo+customerCode ที่เคย
 * ยิงไปแล้ว (ไม่ว่าจะสำเร็จหรือถูกปฏิเสธ) ถูกปลายทางล็อกไว้ 6 เดือน ไม่มีทาง resend หรือ
 * override เลข — ยืนยันจาก ocr-po-matching/backend/erp_status.py (RECORDSTATUS "7" =
 * duplicate PO) ที่คอมเมนต์ตรงตัวว่า "the number is now SPENT ... must issue a new one"
 *
 * ต่างจาก ocr-po-matching ตรงที่เขาให้คนพิมพ์เลขใหม่เอง (เพราะเลข PO ของเขามาจากเอกสาร
 * ลูกค้า ระบบเดาเลขใหม่แทนไม่ได้) ส่วน VMI mint เลขเองอยู่แล้วตั้งแต่ต้น จึงมินท์เลขใหม่ให้
 * อัตโนมัติได้เลย เหมือนออก PO ใหม่ปกติ (nextPoSequence ของวันนี้) ไม่ derive จากเลขเดิม —
 * ปลอดภัยกว่าด้วย เพราะรับประกันไม่ชนกับเลขเดิมที่ปลายทางอาจประมวลผลไปแล้วบางส่วน
 *
 * เนื้อใน (ราคา/โปร/ของแถม/จำนวน) คัดลอกจากใบเดิมทุกตัว — นี่คือ "ขอเลขใหม่ให้เนื้อหาเดิม"
 * ไม่ใช่การคิดราคาหรือโปรใหม่ จึงต้องผ่าน orderItemToDocLine ตัวเดียวกับตอนออกใบครั้งแรก
 *
 * ⚠️ **ยังไม่รองรับ**: วันรับของอาจกลายเป็นอดีตไปแล้วถ้าปฏิเสธมานาน (deliveryDate มาจาก
 * Order เดิม ไม่ได้ถูกแก้ในนี้) — ยังไม่ใช่เรื่องที่ถูกขอให้ทำ ปล่อยให้ตัวตรวจความพร้อม
 * ปกติ (checkErpReadiness) จับตอนกดส่งจริงอีกที
 */
export interface CloneForErpResult {
  poNumber: string;
  replaces: string;
  exportPath: string;
}

export async function cloneRejectedPoForErp(
  poNumber: string,
  actorEmail: string
): Promise<CloneForErpResult> {
  const old = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    include: {
      order: { include: { store: true } },
      items: { include: { sku: true } },
    },
  });
  if (!old) throw new Error("PO_NOT_FOUND");
  if (old.erpSentAt) throw new Error("ALREADY_SENT");
  if (!old.erpError) throw new Error("NOT_REJECTED");
  // timeout/network/http_error = ไม่รู้ว่าเข้าไปแล้วหรือไม่ ขอเลขใหม่ตอนนั้นเสี่ยงส่งซ้ำสองเลข
  // (null = แถวเก่าก่อนมีคอลัมน์นี้ ก็ถือว่าไม่ชัดเจนเหมือนกัน ห้ามเดาว่า rejected)
  if (old.erpFailureKind !== "rejected") throw new Error("AMBIGUOUS_FAILURE");
  if (old.replacedByPoNumber) {
    throw new Error(`ALREADY_REPLACED:${old.replacedByPoNumber}`);
  }
  if (old.items.length === 0) throw new Error("EMPTY_PO");

  const storeCode = old.order.store.code;
  const storeName = resolveVdaStoreName(storeCode) || old.order.store.name;
  const now = new Date();

  const seq = await nextPoSequence(storeCode, now);
  const newPoNumber = buildBasePoNumber(vdaPoPrefix(storeCode), now, seq);

  // groupKey ต้อง unique ต่อ orderId — หาตัวอักษรแรกที่ยังไม่มีใครใช้ในออเดอร์นี้
  const siblings = await prisma.purchaseOrder.findMany({
    where: { orderId: old.orderId },
    select: { groupKey: true },
  });
  const usedGroupKeys = new Set(siblings.map((s) => s.groupKey));
  let newGroupKey = "";
  for (let i = 0; i < 26; i++) {
    const candidate = groupKeyAt(i);
    if (!usedGroupKeys.has(candidate)) {
      newGroupKey = candidate;
      break;
    }
  }
  if (!newGroupKey) throw new Error("NO_GROUP_KEY_AVAILABLE");

  const doc = buildPoDocument({
    poNumber: newPoNumber,
    groupKey: newGroupKey,
    priceKind: old.priceKind as PoPriceKind,
    orderId: old.orderId,
    storeCode,
    storeName,
    approvedAt: now,
    approvedBy: actorEmail,
    deliveryDate: old.order.deliveryDate
      ? bangkokDateStr(old.order.deliveryDate)
      : null,
    lines: old.items.map(orderItemToDocLine),
  });

  // เขียนไฟล์ก่อนเข้า transaction — ถ้า transaction ล้มเพราะแข่งกันแพ้ ไฟล์นี้จะกำพร้า
  // (แนวเดียวกับที่ approve-with-split.ts ยอมรับไว้แล้วเมื่อ mint เลขแล้ว rollback)
  const exportPath = await writePoDocument(doc);

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          orderId: old.orderId,
          poNumber: newPoNumber,
          groupKey: newGroupKey,
          priceKind: old.priceKind,
          itemCount: old.items.length,
          totalQty: doc.totalQty,
          totalAmount: doc.totalAmount,
          exportPath,
          issuedBy: actorEmail,
          erpReplacesPoNumber: poNumber,
        },
      });

      for (const item of old.items) {
        await tx.orderItem.create({
          data: {
            orderId: old.orderId,
            skuId: item.skuId,
            suggestedQty: item.suggestedQty,
            finalQty: item.finalQty,
            cvdEstimate: item.cvdEstimate,
            minDays: item.minDays,
            maxDays: item.maxDays,
            unitPriceOverride: item.unitPriceOverride,
            c4UnitPrice: item.c4UnitPrice,
            c4DiscountBaht: item.c4DiscountBaht,
            c4DiscountPct: item.c4DiscountPct,
            c4NetUnitPrice: item.c4NetUnitPrice,
            c4PriceExpired: item.c4PriceExpired,
            priceFlagged: item.priceFlagged,
            priceFlagReason: item.priceFlagReason,
            c4PromoLabel: item.c4PromoLabel,
            c4PromoKind: item.c4PromoKind,
            c4PromoGroup: item.c4PromoGroup,
            c4PromoGroupMembers: item.c4PromoGroupMembers,
            c4PooledQty: item.c4PooledQty,
            c4FreeGoodCode: item.c4FreeGoodCode,
            c4FreeGoodName: item.c4FreeGoodName,
            c4FreeGoodQty: item.c4FreeGoodQty,
            c4FreeGoodUnit: item.c4FreeGoodUnit,
            salesPriceOverride: item.salesPriceOverride,
            salesPriceBy: item.salesPriceBy,
            salesPriceAt: item.salesPriceAt,
            poGroup: newGroupKey,
            purchaseOrderId: created.id,
          },
        });
      }

      // compare-and-set: ถ้ามีคำขออื่นชิงขอเลขใหม่ไปก่อน หรือใบนี้ถูกส่งสำเร็จไปแล้วระหว่างที่
      // เราเตรียมของ (mint เลข/เขียนไฟล์/copy items ใช้เวลา) ต้องยกเลิกทั้งใบใหม่ทั้งหมด —
      // ไม่ปล่อยให้มี PO ซ้อนสองใบสำหรับการปฏิเสธครั้งเดียว
      const claim = await tx.purchaseOrder.updateMany({
        where: { poNumber, erpSentAt: null, replacedByPoNumber: null },
        data: { replacedByPoNumber: newPoNumber, erpVoidedAt: now },
      });
      if (claim.count !== 1) throw new Error("RACE_LOST");
    });
  } catch (err) {
    // สองคำขอขอเลขใหม่ใบเดียวกันพร้อมกันอาจแข่งกันเลือก groupKey ตัวเดียวกันได้
    // (อ่าน siblings ก่อนเข้า transaction) ⇒ ฝั่งที่แพ้ชน @@unique([orderId, groupKey])
    // ที่ระดับ DB ตรง ๆ ไม่ใช่ CAS ข้างบน — ปรับให้เป็น RACE_LOST เหมือนกัน เพราะผลจริง
    // เหมือนกัน (transaction ทั้งก้อน rollback แล้ว ไม่มี PO ค้าง) ผู้เรียกจัดการเป็นเรื่องเดียวกันได้
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("RACE_LOST");
    }
    throw err;
  }

  return { poNumber: newPoNumber, replaces: poNumber, exportPath };
}
