import { prisma } from "@/lib/prisma";
import { approveWithPoSplit, type ApproveWithSplitResult } from "./approve-with-split";

/**
 * อนุมัติเฉพาะบางรายการในออเดอร์ — รายการที่ไม่ได้เลือกย้ายไปเป็นออเดอร์ใหม่ของร้านเดิม
 * (รออนุมัติ) แล้วค่อยอนุมัติใบเดิมที่เหลือแต่รายการที่เลือกผ่าน approveWithPoSplit ตามปกติ
 *
 * ทำไมไม่ "อนุมัติหลายรอบในใบเดียว": การจองสิทธิ์อนุมัติ (compare-and-set) สถานะ, decidedAt
 * และ @@unique([orderId, groupKey]) ของ PurchaseOrder ผูกกับทั้งใบ — แยกเป็นใบใหม่ได้ทุกกลไกเดิม
 * ครบโดยไม่ต้องรื้อ (ดูเหตุผลเต็มใน docs/IMPROVEMENT-PLAN.md หัวข้อ A1b)
 *
 * ย้ายแถวเดิม (เปลี่ยน orderId) ไม่ได้ก็อป — id/requestedQty/สถานะรอร้านยืนยัน/หลักฐานราคาติดไปครบ
 * ร้านที่ยังไม่ได้ตอบรายการรอยืนยันก็ตอบต่อในใบใหม่ได้เลย
 */

export class PartialSelectionError extends Error {}

export interface SelectionItem {
  id: string;
  skuCode: string;
  c4PromoGroup: string | null;
  c4PromoGroupMembers: number | null;
}

/**
 * กลุ่มโปรที่รวมยอดกัน (>1 สมาชิก) ห้ามเลือกครึ่งกลุ่ม — ส่วนลดขั้นบันไดที่แช่ไว้คิดจากยอดรวม
 * ทั้งกลุ่มในออเดอร์ ถ้าแยกคนละใบ ทั้งสองฝั่งจะถือส่วนลดที่ยอดของตัวเองไม่ถึงจริง
 */
export function checkPromoGroupSelection(
  items: SelectionItem[],
  selected: Set<string>
): string[] {
  const byGroup = new Map<string, SelectionItem[]>();
  for (const i of items) {
    const g = i.c4PromoGroup?.trim();
    if (!g || (i.c4PromoGroupMembers ?? 0) <= 1) continue;
    byGroup.set(g, [...(byGroup.get(g) ?? []), i]);
  }
  const errors: string[] = [];
  for (const [g, members] of byGroup) {
    const picked = members.filter((m) => selected.has(m.id)).length;
    if (picked > 0 && picked < members.length) {
      errors.push(
        `กลุ่มโปร ${g} ต้องเลือกทั้งกลุ่ม (เลือกไว้ ${picked} จาก ${members.length}: ${members
          .map((m) => m.skuCode)
          .join(", ")})`
      );
    }
  }
  return errors;
}

export async function approveSelectedItems(
  orderId: string,
  actorEmail: string,
  selectedIds: string[],
  poNumberOverrides: Record<string, string>
): Promise<ApproveWithSplitResult & { remainderOrderId: string | null; remainderCount: number }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { sku: { select: { code: true } } } } },
  });
  if (!order) throw new Error("ไม่พบออเดอร์");

  const selected = new Set(selectedIds);
  const known = new Set(order.items.map((i) => i.id));
  if (selectedIds.some((id) => !known.has(id))) {
    throw new PartialSelectionError("รายการที่เลือกไม่อยู่ในออเดอร์นี้ — รีเฟรชหน้าแล้วลองใหม่");
  }
  if (selected.size === 0) {
    throw new PartialSelectionError("ยังไม่ได้เลือกรายการ");
  }

  const rest = order.items.filter((i) => !selected.has(i.id));
  // เลือกครบทุกรายการ = อนุมัติทั้งใบตามปกติ ไม่ต้องแยก
  if (rest.length === 0) {
    const result = await approveWithPoSplit(orderId, actorEmail, poNumberOverrides);
    return { ...result, remainderOrderId: null, remainderCount: 0 };
  }

  const groupErrors = checkPromoGroupSelection(
    order.items.map((i) => ({
      id: i.id,
      skuCode: i.sku.code,
      c4PromoGroup: i.c4PromoGroup,
      c4PromoGroupMembers: i.c4PromoGroupMembers,
    })),
    selected
  );
  if (groupErrors.length > 0) throw new PartialSelectionError(groupErrors.join("\n"));

  const restIds = rest.map((i) => i.id);

  // แยกใบใน transaction เดียว — เช็คสถานะซ้ำตอนเขียน กันอีกคนอนุมัติ/ปฏิเสธไปก่อนระหว่างทาง
  const remainder = await prisma.$transaction(async (tx) => {
    const still = await tx.order.count({
      where: { id: orderId, status: "pending_approval", purchaseOrders: { none: {} } },
    });
    if (still === 0) throw new Error("ORDER_ALREADY_DECIDED");
    const created = await tx.order.create({
      data: {
        storeId: order.storeId,
        status: "pending_approval",
        deliveryDate: order.deliveryDate,
        // คงวันที่ร้านส่งจริงไว้ — เป็นของที่ร้านสั่งมาตั้งแต่วันนั้น ไม่ใช่ออเดอร์ที่ร้านเพิ่งส่ง
        createdAt: order.createdAt,
      },
    });
    const moved = await tx.orderItem.updateMany({
      where: { id: { in: restIds }, orderId },
      // กลุ่ม PO ที่จัดไว้เป็นของใบเดิม — ใบใหม่ให้ระบบเสนอใหม่
      data: { orderId: created.id, poGroup: null },
    });
    if (moved.count !== restIds.length) throw new Error("ORDER_CHANGED");
    return created;
  });

  try {
    const result = await approveWithPoSplit(orderId, actorEmail, poNumberOverrides);
    return { ...result, remainderOrderId: remainder.id, remainderCount: restIds.length };
  } catch (err) {
    // อีกคนชิงอนุมัติ/ปฏิเสธใบเดิมไปก่อน (หลังแยกเสร็จ) — ห้ามรวมกลับเข้าใบที่ตัดสินแล้ว
    // ปล่อยใบใหม่ค้างเป็นออเดอร์รออนุมัติตามปกติ ของไม่หาย
    if (err instanceof Error && err.message === "ORDER_ALREADY_DECIDED") throw err;
    // อนุมัติไม่ผ่าน (แบ่ง PO ไม่ถูก ฯลฯ) — รวมกลับเป็นใบเดิมให้เหมือนไม่เคยกด
    // ไม่งั้นพนักงานจะเห็นออเดอร์แตกเป็นสองใบทั้งที่ยังไม่ได้ออก PO เลย
    await prisma
      .$transaction([
        prisma.orderItem.updateMany({
          where: { orderId: remainder.id },
          data: { orderId },
        }),
        prisma.order.deleteMany({
          where: { id: remainder.id, status: "pending_approval" },
        }),
      ])
      .catch((mergeErr) => {
        console.error(
          `[approve-selected] รวมกลับไม่สำเร็จ — ออเดอร์ ${remainder.id} ถูกแยกค้างจาก ${orderId}:`,
          mergeErr
        );
      });
    throw err;
  }
}
