import { prisma } from "@/lib/prisma";
import { getSkuMasterDirectory } from "@/lib/fabric";
import {
  evaluatePooledDiscountConsistency,
  evaluatePriceOverride,
} from "@/lib/calculations";
import {
  lookupOrderPromoLines,
  type OrderPromoLineResult,
} from "@/lib/promo/lookup-order-lines";

/**
 * พนักงานเพิ่มสินค้าใหม่ (SKU ที่ไม่เคยอยู่ในออเดอร์เลย) เข้าออเดอร์ที่ร้านส่งมาแล้ว
 *
 * requestedQty แช่เป็น 0 เสมอ (ร้านไม่เคยขอ) — finalQty ที่พนักงานคีย์ > 0 เสมอ จึงเข้าเงื่อนไข
 * "เพิ่มจำนวน" ของเดิมโดยอัตโนมัติ (ดู updateOrderItemQty ใน prisma-repository.ts) กลไกรอร้าน
 * ยืนยัน/ปฏิเสธ/กันอนุมัติที่มีอยู่แล้วจึงใช้ซ้ำได้ทั้งหมดโดยไม่ต้องแก้
 *
 * จุดที่ต้องระวังที่สุด: ถ้า SKU ใหม่อยู่ "กลุ่มโปรที่รวมยอด" (ASSORTEDPRODUCTGROUP) เดียวกับ
 * ของเดิมในออเดอร์ ต้องเรียก lookupOrderPromoLines รวมกับพี่น้องเดิมในคำเรียกเดียว ไม่งั้น
 * pooledQty/ส่วนลด/ของแถมของทั้งกลุ่มจะผิด (lookupC4 รู้จักแค่รายการที่ส่งเข้าไปในคำเรียกนั้น)
 * ต้องอัปเดตพี่น้องเฉพาะฟิลด์ที่ผูกกับ pooled เท่านั้น ห้ามแตะราคา/priceFlagged เดิมของพวกมัน
 * (นั่นคือหลักฐานราคา ณ ตอนร้านส่งจริง)
 */
export async function addOrderItem(
  orderId: string,
  storeId: string,
  skuCode: string,
  finalQty: number
): Promise<{ skuName: string }> {
  // สินค้านี้อาจไม่เคยมีแถวในฐานข้อมูลเลยถ้าไม่เคยอยู่ในสต็อกร้านไหนมาก่อน — upsert กันชน
  // เมื่อพนักงานสองคนเพิ่มสินค้าใหม่ตัวเดียวกันพร้อมกัน
  const skuName = getSkuMasterDirectory().nameForSku(skuCode) || skuCode;
  const sku = await prisma.sku.upsert({
    where: { code: skuCode },
    create: { code: skuCode, name: skuName },
    update: {},
  });

  // กันเพิ่มซ้ำ — ไม่ว่าแถวเดิมจะอยู่สถานะไหน (แม้ถูกปฏิเสธไปแล้ว/qty=0) ให้ไปแก้จำนวน
  // ที่รายการเดิมแทนด้วย updateQty ไม่ใช่เปิดแถวใหม่ซ้อนกัน
  const existingItem = await prisma.orderItem.findFirst({
    where: { orderId, skuId: sku.id },
    select: { id: true },
  });
  if (existingItem) {
    throw new Error(
      `SKU_ALREADY_IN_ORDER:${skuCode} มีอยู่ในออเดอร์นี้แล้ว — แก้จำนวนที่รายการเดิมแทน`
    );
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { code: true },
  });
  const storeCode = store?.code ?? "";

  let c4: OrderPromoLineResult | null = null;
  let promoLoaded = true;
  try {
    const single = lookupOrderPromoLines(storeCode, [{ skuCode, qty: finalQty }]);
    c4 = single.lines[0] ?? null;
  } catch {
    // PROMO_NOT_LOADED — ยืนยันราคาไม่ได้ ให้ธงเป็น "unverified" เหมือนตอนสร้างออเดอร์
    c4 = null;
    promoLoaded = false;
  }

  const verdict = evaluatePriceOverride({
    override: null,
    c4UnitPrice: c4?.unitPrice ?? null,
    promoLoaded,
  });
  const free = c4?.freeGood ?? null;
  const newItemData = {
    orderId,
    skuId: sku.id,
    // ไม่มีคำแนะนำระบบสำหรับของที่พนักงานคีย์เพิ่มเอง — 0 = "ไม่ใช่คำแนะนำ" ไม่ใช่ "แนะนำ 0"
    suggestedQty: 0,
    finalQty,
    // ร้านไม่เคยขอสินค้าตัวนี้เลย — requestedQty=0 ทำให้เข้าเงื่อนไข "เพิ่มจำนวน" ของเดิม
    // โดยอัตโนมัติ (finalQty ที่พนักงานคีย์ > 0 เสมอ) ต้องรอร้านยืนยันก่อนเข้า PO ได้เหมือนกัน
    requestedQty: 0,
    qtyIncreasePendingConfirm: true,
    cvdEstimate: null as number | null,
    minDays: null as number | null,
    maxDays: null as number | null,
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
    discountFlagged: false,
    discountFlagReason: null as string | null,
  };

  // อยู่กลุ่มโปรที่รวมยอดจริง (>1 สมาชิกใน C4 master) — ต้องดูว่าออเดอร์นี้มีพี่น้องกลุ่ม
  // เดียวกันอยู่แล้วไหม ถ้ามีต้องคำนวณร่วมกัน ไม่งั้น pooledQty ของทั้งกลุ่มจะผิด
  // ห้ามแตะ c4UnitPrice/unitPriceOverride/priceFlagged ของพี่น้องเดิม
  let siblingUpdates: { id: string; data: Record<string, unknown> }[] = [];

  if (c4?.promoGroup && (c4.promoGroupMembers ?? 0) > 1) {
    const siblings = await prisma.orderItem.findMany({
      where: { orderId, c4PromoGroup: c4.promoGroup },
      include: { sku: { select: { code: true } } },
    });

    if (siblings.length > 0) {
      const pooled = computePooledGroup(storeCode, c4.promoGroup, [
        { skuCode, finalQty, fallbackPooledQty: null },
        ...siblings.map((s) => ({
          skuCode: s.sku.code,
          finalQty: s.finalQty,
          fallbackPooledQty: s.c4PooledQty,
        })),
      ]);

      if (pooled) {
        const [newLine, ...siblingLines] = pooled;
        if (newLine.promo) Object.assign(newItemData, newLine.promo);
        newItemData.discountFlagged = newLine.flag.discountFlagged;
        newItemData.discountFlagReason = newLine.flag.discountFlagReason;
        siblingUpdates = siblings.map((s, idx) => ({
          id: s.id,
          data: { ...siblingLines[idx].promo, ...siblingLines[idx].flag },
        }));
      }
    }
  }

  await prisma.$transaction([
    prisma.orderItem.create({ data: newItemData }),
    ...siblingUpdates.map((u) =>
      prisma.orderItem.update({ where: { id: u.id }, data: u.data })
    ),
  ]);

  return { skuName };
}

/**
 * ร้านปฏิเสธสินค้าที่พนักงานเพิ่มเข้ามาเอง (requestedQty=0) — ลบบรรทัดทิ้งทั้งแถว
 *
 * ต่างจากปฏิเสธการเพิ่มจำนวนของสินค้าเดิม (คืน finalQty กลับไปเท่าที่ร้านขอ) เพราะร้านไม่เคย
 * สั่งสินค้าตัวนี้เลย ถ้าคืนเป็น 0 แถวจะค้างในออเดอร์ และถ้าอยู่กลุ่มโปร approveWithPoSplit
 * จะเก็บบรรทัด 0 หีบเข้า PO ด้วย (ตั้งใจเก็บบรรทัดกลุ่มไว้ ดูเหตุผลใน approve-with-split.ts)
 *
 * ตอนเพิ่ม addOrderItem ดัน pooledQty/ส่วนลดของพี่น้องกลุ่มเดียวกันขึ้นไปแล้ว — ลบแล้วต้อง
 * คำนวณพี่น้องที่เหลือใหม่ด้วย ไม่งั้นพี่น้องค้างส่วนลดขั้นที่ได้มาเพราะสินค้าที่ร้านไม่เอา
 */
export async function removeRejectedAddedItem(
  orderId: string,
  itemId: string
): Promise<void> {
  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId, qtyIncreasePendingConfirm: true, requestedQty: 0 },
    select: {
      c4PromoGroup: true,
      order: { select: { store: { select: { code: true } } } },
    },
  });
  if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");

  let siblingUpdates: { id: string; data: Record<string, unknown> }[] = [];
  if (item.c4PromoGroup) {
    const siblings = await prisma.orderItem.findMany({
      where: { orderId, c4PromoGroup: item.c4PromoGroup, NOT: { id: itemId } },
      include: { sku: { select: { code: true } } },
    });
    if (siblings.length > 0) {
      const pooled = computePooledGroup(item.order.store.code, item.c4PromoGroup, [
        ...siblings.map((s) => ({
          skuCode: s.sku.code,
          finalQty: s.finalQty,
          fallbackPooledQty: s.c4PooledQty,
        })),
      ]);
      siblingUpdates = siblings.map((s, idx) => ({
        id: s.id,
        // โปรยังไม่โหลด คำนวณใหม่ไม่ได้ — ยังลบได้ (ร้านปฏิเสธแล้ว ห้ามค้าง) แต่ปักธงให้พนักงาน
        // ตรวจขั้นโปรก่อนอนุมัติ เพราะส่วนลดที่ค้างอยู่นับรวมสินค้าที่ถูกลบไปแล้ว
        data: pooled
          ? { ...pooled[idx].promo, ...pooled[idx].flag }
          : {
              discountFlagged: true,
              discountFlagReason:
                "ร้านปฏิเสธสินค้าในกลุ่มโปรเดียวกัน แต่คำนวณโปรใหม่ไม่ได้ (โปรยังไม่โหลด) — ตรวจขั้นโปรก่อนอนุมัติ",
            },
      }));
    }
  }

  await prisma.$transaction([
    // เงื่อนไขซ้ำใน where กันร้านกดซ้อน/พนักงานแก้จำนวนระหว่างทาง
    prisma.orderItem.deleteMany({
      where: { id: itemId, orderId, qtyIncreasePendingConfirm: true, requestedQty: 0 },
    }),
    ...siblingUpdates.map((u) =>
      prisma.orderItem.update({ where: { id: u.id }, data: u.data })
    ),
  ]);
}

/**
 * คำนวณโปรของทั้งกลุ่มที่รวมยอดในคำเรียกเดียว — คืนผลตามลำดับ lines, null = โปรยังไม่โหลด
 * แตะเฉพาะฟิลด์ที่ผูกกับ pooled ห้ามคืนราคา/priceFlagged (หลักฐานราคา ณ ตอนร้านส่ง)
 */
function computePooledGroup(
  storeCode: string,
  promoGroup: string,
  lines: { skuCode: string; finalQty: number; fallbackPooledQty: number | null }[]
): {
  promo: Record<string, unknown> | null;
  flag: { discountFlagged: boolean; discountFlagReason: string | null };
}[] | null {
  let combo: ReturnType<typeof lookupOrderPromoLines>;
  try {
    combo = lookupOrderPromoLines(
      storeCode,
      lines.map((l) => ({ skuCode: l.skuCode, qty: l.finalQty }))
    );
  } catch {
    return null;
  }

  const promos = lines.map((l, idx) => {
    const r = combo.lines[idx];
    if (!r) return null;
    const free = r.freeGood ?? null;
    return {
      c4PooledQty: r.pooledQty ?? l.fallbackPooledQty,
      c4DiscountBaht: r.discountBaht ?? null,
      c4DiscountPct: r.discountPct ?? null,
      c4NetUnitPrice: r.netUnitPrice ?? null,
      c4PromoLabel: r.currentPromo ?? null,
      c4PromoKind: r.currentKind ?? null,
      c4FreeGoodCode: free?.premiumProduct ?? null,
      c4FreeGoodName: free?.premiumName ?? null,
      c4FreeGoodQty: free?.qty ?? null,
      c4FreeGoodUnit: free?.unitLabel ?? null,
    };
  });

  const consistency = evaluatePooledDiscountConsistency(
    lines.map((l, idx) => ({
      skuCode: l.skuCode,
      finalQty: l.finalQty,
      c4PromoGroup: promoGroup,
      c4PooledQty: promos[idx]?.c4PooledQty ?? null,
      c4DiscountBaht: promos[idx]?.c4DiscountBaht ?? null,
      c4DiscountPct: promos[idx]?.c4DiscountPct ?? null,
      c4PromoLabel: promos[idx]?.c4PromoLabel ?? null,
    }))
  );

  return lines.map((l, idx) => {
    const f = consistency.get(l.skuCode) ?? { flagged: false, reason: null };
    return {
      promo: promos[idx],
      flag: { discountFlagged: f.flagged, discountFlagReason: f.reason },
    };
  });
}
