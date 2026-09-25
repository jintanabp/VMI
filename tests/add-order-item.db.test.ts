import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * พนักงานเพิ่มสินค้าใหม่ (SKU ที่ไม่เคยอยู่ในออเดอร์) เข้าออเดอร์ที่ร้านส่งมาแล้ว
 *
 * จุดที่พิสูจน์ด้วย pure function ไม่ได้: ต้องมี DB จริง (สร้าง OrderItem ใหม่ +
 * อัปเดตพี่น้องกลุ่มโปรเดียวกัน) ผสมกับต้องมี C4 promo master จริง (lookupOrderPromoLines
 * เรียก lookupC4 ซึ่งต้องมีไฟล์โปรจริงถึงจะคำนวณ pooled qty ข้าม SKU ได้) — mock
 * @/lib/fabric ให้คืนไฟล์โปรจำลองเล็ก ๆ ตาม pattern เดียวกับ tests/promo-month.test.ts
 */

const hasPrisma = prismaCliAvailable();

const HEADER =
  "FROMDATE,TODATE,DIVISIONSALE,PRODUCTCODE,PURCHASEQUANTITYFROM,PURCHASEQUANTITYTO,PURCHASEUNIT,TOBREAKUP,COUNTRY,BANGKOK,CENTRAL,NORTHEAST,NORTH,SOUTH,CUSTOMERGROUP,DISCOUNTAMOUNT,DISCOUNTPERCENT,SPECIALUNITPRICE,MARKETINGUSER,PREMIUMPRODUCT,PREMIUMQUANTITY,PREMIUMUNIT,ASSORTEDPRODUCTGROUP,RECORDSTATUS,USERCODE,CREATEDATE,UpdateDate,MINIMUMPURCHASE";

function row(o: {
  product: string;
  group: string;
  fromQty: number;
  toQty: number;
  discAmt: number;
}): string {
  return [
    "2026-09-01T07:00:00.000+07:00",
    "2026-09-30T07:00:00.000+07:00",
    "E",
    o.product,
    o.fromQty.toFixed(1),
    o.toQty.toFixed(1),
    "B",
    "N",
    "Y", // COUNTRY = ได้ทั้งประเทศ ไม่ต้องยุ่งกับภาค
    "N",
    "N",
    "N",
    "N",
    "N",
    "98",
    o.discAmt.toFixed(1),
    "0.0",
    "0.0",
    "MK101",
    "",
    "0.0",
    "",
    o.group,
    '""',
    "AM133",
    "2026-08-07T22:19:39.000+07:00",
    "2026-09-18 14:30:37",
    "0.0",
  ].join(",");
}

const GROUP = "GRP1";
const SKU_A = "SKUA01";
const SKU_B = "SKUB02";
const NO_GROUP_SKU = "NOGROUP1";

describe.skipIf(!hasPrisma)("addOrderItem — เพิ่มสินค้าใหม่เข้าออเดอร์", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let addOrderItem: typeof import("@/lib/po/add-order-item").addOrderItem;
  let removeRejectedAddedItem: typeof import("@/lib/po/add-order-item").removeRejectedAddedItem;
  let promoDir: string;

  beforeAll(async () => {
    db = createTestDatabase("vmi-add-item");
    // ต้องตั้งก่อน import — lib/prisma อ่าน DATABASE_URL ตอนสร้าง client
    setTestDatabaseUrl(db.url);

    // กลุ่มโปร GRP1 มี 2 SKU ทุกตัวมีขั้นเดียวกัน: 1-4 หีบ ลด 20 · 5+ หีบ ลด 50
    promoDir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-add-item-promo-"));
    const rows = [SKU_A, SKU_B].flatMap((sku) => [
      row({ product: sku, group: GROUP, fromQty: 1, toQty: 4, discAmt: 20 }),
      row({ product: sku, group: GROUP, fromQty: 5, toQty: 9999, discAmt: 50 }),
    ]);
    const csvPath = path.join(promoDir, "cft_promotion_cash.csv");
    fs.writeFileSync(csvPath, [HEADER, ...rows].join("\n"), "utf-8");

    const { PromotionCredit } = await import("@/lib/fabric/promotion-credit");
    const promo = new PromotionCredit();
    promo.load(csvPath);

    vi.doMock("@/lib/fabric", () => ({
      fabricPromoReady: () => true,
      fabricSkuMasterReady: () => true,
      getPromotionCreditDirectory: () => promo,
      getSkuMasterDirectory: () => ({
        // GHOST = รหัสที่ไม่มีในแคตตาล็อก
        nameForSku: (code: string) => (code === "GHOST" ? "" : `สินค้า ${code}`),
        packSizeForSku: () => 1,
        getLookupPrice: () => ({ price: 999, expired: false }),
      }),
      resolvePromoContext: () => ({
        division: "E",
        cusgroup: "98",
        region: "COUNTRY",
      }),
    }));

    ({ addOrderItem, removeRejectedAddedItem } = await import("@/lib/po/add-order-item"));
    ({ prisma } = await import("@/lib/prisma"));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
    fs.rmSync(promoDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.store.deleteMany();
    await prisma.sku.deleteMany();
  });

  /** ออเดอร์ที่มี SKU_A อยู่แล้วในกลุ่มโปร GRP1 — จำลองสภาพหลังร้านส่งของจริง (pooled qty=3 คนเดียว) */
  async function seedOrderWithSiblingInGroup() {
    const store = await prisma.store.create({
      data: { code: "vda1", name: "VDA1" },
    });
    const skuA = await prisma.sku.create({
      data: { code: SKU_A, name: "สินค้า A" },
    });
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        status: "pending_approval",
        items: {
          create: [
            {
              skuId: skuA.id,
              suggestedQty: 3,
              finalQty: 3,
              requestedQty: 3,
              c4UnitPrice: 999,
              c4PromoGroup: GROUP,
              c4PromoGroupMembers: 2,
              c4PooledQty: 3,
              c4DiscountBaht: 20,
              priceFlagged: false,
            },
          ],
        },
      },
      include: { items: true },
    });
    return {
      storeId: store.id,
      orderId: order.id,
      skuAItemId: order.items[0]!.id,
    };
  }

  it("เพิ่มสินค้าที่ไม่มีกลุ่มโปร — สร้างบรรทัดใหม่รอร้านยืนยันได้ปกติ", async () => {
    const store = await prisma.store.create({
      data: { code: "vda2", name: "VDA2" },
    });
    const order = await prisma.order.create({
      data: { storeId: store.id, status: "pending_approval" },
    });

    const result = await addOrderItem(order.id, store.id, NO_GROUP_SKU, 5);
    expect(result.skuName).toBe(`สินค้า ${NO_GROUP_SKU}`);

    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(item.finalQty).toBe(5);
    expect(item.requestedQty).toBe(0);
    expect(item.qtyIncreasePendingConfirm).toBe(true);
    // ไม่มีคำแนะนำระบบสำหรับของที่พนักงานคีย์เพิ่มเอง
    expect(item.suggestedQty).toBe(0);
    expect(item.cvdEstimate).toBeNull();
  });

  it("เพิ่มสินค้าที่อยู่กลุ่มโปรเดียวกับของเดิมในออเดอร์ — คำนวณ pooled ร่วมกันถูกต้อง ไม่แตะราคาของพี่น้อง", async () => {
    const { storeId, orderId, skuAItemId } = await seedOrderWithSiblingInGroup();

    await addOrderItem(orderId, storeId, SKU_B, 3);

    const skuB = await prisma.sku.findUniqueOrThrow({ where: { code: SKU_B } });
    const newItem = await prisma.orderItem.findFirstOrThrow({
      where: { orderId, skuId: skuB.id },
    });
    // pooled qty รวม = 3 (เดิม) + 3 (ใหม่) = 6 → เข้าขั้น 5+ ลด 50 ไม่ใช่ขั้น 1-4 ลด 20
    // (ถ้าเรียก lookup ด้วยบรรทัดใหม่เดี่ยว ๆ จะได้ pooledQty=3 ลด 20 ซึ่งผิด)
    expect(newItem.c4PooledQty).toBe(6);
    expect(newItem.c4DiscountBaht).toBe(50);
    expect(newItem.c4PromoGroup).toBe(GROUP);
    expect(newItem.requestedQty).toBe(0);
    expect(newItem.qtyIncreasePendingConfirm).toBe(true);

    const sibling = await prisma.orderItem.findUniqueOrThrow({
      where: { id: skuAItemId },
    });
    // พี่น้องต้องถูกอัปเดต pooled ให้ตรงกับยอดรวมใหม่ (6 → ลด 50) ไม่ใช่ค้างที่ 3/ลด 20 เดิม
    expect(sibling.c4PooledQty).toBe(6);
    expect(sibling.c4DiscountBaht).toBe(50);
    // ห้ามแตะราคา/priceFlagged/จำนวนเดิมของพี่น้อง — นี่คือหลักฐานราคา ณ ตอนร้านส่งจริง
    expect(sibling.c4UnitPrice).toBe(999);
    expect(sibling.priceFlagged).toBe(false);
    expect(sibling.finalQty).toBe(3);
    expect(sibling.requestedQty).toBe(3);
  });

  it("กันเพิ่ม SKU ซ้ำ — ถ้ามีแถวของ SKU นี้ในออเดอร์อยู่แล้ว ต้องโยน error บอกให้แก้จำนวนที่เดิมแทน", async () => {
    const { storeId, orderId } = await seedOrderWithSiblingInGroup();

    await expect(addOrderItem(orderId, storeId, SKU_A, 10)).rejects.toThrow(
      "SKU_ALREADY_IN_ORDER:"
    );

    // ต้องไม่มีแถวใหม่ถูกสร้างขึ้นมาซ้อน — ยังมีแค่ 1 แถวของ SKU_A เท่าเดิม
    const count = await prisma.orderItem.count({ where: { orderId } });
    expect(count).toBe(1);
  });

  it("ร้านปฏิเสธสินค้าที่พนักงานเพิ่ม — ลบทั้งแถว และคืน pooled/ส่วนลดของพี่น้องกลับเป็นยอดเดิม", async () => {
    const { storeId, orderId, skuAItemId } = await seedOrderWithSiblingInGroup();
    await addOrderItem(orderId, storeId, SKU_B, 3);
    const skuB = await prisma.sku.findUniqueOrThrow({ where: { code: SKU_B } });
    const added = await prisma.orderItem.findFirstOrThrow({
      where: { orderId, skuId: skuB.id },
    });

    await removeRejectedAddedItem(orderId, added.id);

    // ไม่ค้างเป็นบรรทัด 0 หีบ — ไม่งั้นบรรทัดกลุ่มโปรจะติดเข้า PO ตอนอนุมัติ
    expect(await prisma.orderItem.count({ where: { id: added.id } })).toBe(0);
    expect(await prisma.orderItem.count({ where: { orderId } })).toBe(1);

    const sibling = await prisma.orderItem.findUniqueOrThrow({
      where: { id: skuAItemId },
    });
    // ยอดรวมกลับเป็น 3 คนเดียว → ขั้น 1-4 ลด 20 ไม่ค้างขั้น 5+ ลด 50 ที่ได้มาจากสินค้าที่ร้านไม่เอา
    expect(sibling.c4PooledQty).toBe(3);
    expect(sibling.c4DiscountBaht).toBe(20);
    expect(sibling.c4UnitPrice).toBe(999);
    expect(sibling.finalQty).toBe(3);
  });

  it("siblingRepriceAfterRemoval (เคลียร์ SKU สิ้นเดือน) — พี่น้องที่เหลือกลับเป็นขั้นตามยอดของตัวเอง", async () => {
    const { storeId, orderId, skuAItemId } = await seedOrderWithSiblingInGroup();
    await addOrderItem(orderId, storeId, SKU_B, 3);
    const skuB = await prisma.sku.findUniqueOrThrow({ where: { code: SKU_B } });
    const b = await prisma.orderItem.findFirstOrThrow({ where: { orderId, skuId: skuB.id } });

    const { siblingRepriceAfterRemoval } = await import("@/lib/po/add-order-item");
    const updates = await siblingRepriceAfterRemoval(orderId, "vda1", GROUP, [b.id], "test");
    expect(updates.map((u) => u.id)).toEqual([skuAItemId]);
    expect(updates[0]!.data.c4PooledQty).toBe(3);
    expect(updates[0]!.data.c4DiscountBaht).toBe(20);
    // ห้ามคืนฟิลด์ราคา — หลักฐานราคา ณ ตอนร้านส่ง
    expect(updates[0]!.data).not.toHaveProperty("c4UnitPrice");
  });

  it("รหัสที่ไม่มีในแคตตาล็อก → ปฏิเสธ ไม่สร้างแถว Sku/บรรทัดใหม่", async () => {
    const { storeId, orderId } = await seedOrderWithSiblingInGroup();
    await expect(addOrderItem(orderId, storeId, "GHOST", 1)).rejects.toThrow("SKU_NOT_IN_MASTER");
    expect(await prisma.sku.count({ where: { code: "GHOST" } })).toBe(0);
    expect(await prisma.orderItem.count({ where: { orderId } })).toBe(1);
  });

  it("repricePooledGroupOf — แก้จำนวนในกลุ่มแล้ว snapshot pooled ของทั้งกลุ่มตามยอดจริง", async () => {
    const { storeId, orderId, skuAItemId } = await seedOrderWithSiblingInGroup();
    await addOrderItem(orderId, storeId, SKU_B, 3); // รวม 6 → ขั้น 5+ ลด 50
    const skuB = await prisma.sku.findUniqueOrThrow({ where: { code: SKU_B } });
    const b = await prisma.orderItem.findFirstOrThrow({ where: { orderId, skuId: skuB.id } });
    await prisma.orderItem.update({ where: { id: b.id }, data: { finalQty: 1 } }); // รวม 4

    const { repricePooledGroupOf } = await import("@/lib/po/add-order-item");
    await repricePooledGroupOf(orderId, b.id);

    for (const id of [skuAItemId, b.id]) {
      const row = await prisma.orderItem.findUniqueOrThrow({ where: { id } });
      expect(row.c4PooledQty).toBe(4);
      expect(row.c4DiscountBaht).toBe(20);
    }
    const a = await prisma.orderItem.findUniqueOrThrow({ where: { id: skuAItemId } });
    expect(a.c4UnitPrice).toBe(999); // ไม่แตะราคา
  });

  it("repricePooledGroupOf ไม่เขียนทับออเดอร์ที่ไม่ได้รออนุมัติแล้ว", async () => {
    const { storeId, orderId, skuAItemId } = await seedOrderWithSiblingInGroup();
    await addOrderItem(orderId, storeId, SKU_B, 3);
    await prisma.order.update({ where: { id: orderId }, data: { status: "approved" } });
    await prisma.orderItem.update({ where: { id: skuAItemId }, data: { finalQty: 1 } });

    const { repricePooledGroupOf } = await import("@/lib/po/add-order-item");
    await repricePooledGroupOf(orderId, skuAItemId);
    const a = await prisma.orderItem.findUniqueOrThrow({ where: { id: skuAItemId } });
    expect(a.c4PooledQty).toBe(6);
  });

  it("เพิ่มสินค้าในออเดอร์ที่ถูกอนุมัติไปแล้ว → ปฏิเสธ ไม่สร้างแถว", async () => {
    const { storeId, orderId } = await seedOrderWithSiblingInGroup();
    await prisma.order.update({ where: { id: orderId }, data: { status: "approved" } });
    await expect(addOrderItem(orderId, storeId, NO_GROUP_SKU, 1)).rejects.toThrow("ORDER_ALREADY_DECIDED");
    expect(await prisma.orderItem.count({ where: { orderId } })).toBe(1);
  });

  it("ร้านปฏิเสธสินค้าที่ไม่มีกลุ่มโปร — ลบแถวได้ ไม่แตะรายการอื่น", async () => {
    const { storeId, orderId, skuAItemId } = await seedOrderWithSiblingInGroup();
    await addOrderItem(orderId, storeId, NO_GROUP_SKU, 2);
    const sku = await prisma.sku.findUniqueOrThrow({ where: { code: NO_GROUP_SKU } });
    const added = await prisma.orderItem.findFirstOrThrow({
      where: { orderId, skuId: sku.id },
    });

    await removeRejectedAddedItem(orderId, added.id);

    const left = await prisma.orderItem.findMany({ where: { orderId } });
    expect(left.map((i) => i.id)).toEqual([skuAItemId]);
  });

  it("สินค้าที่พนักงานเพิ่ม ร้านยืนยันแล้ว ต่อมาขอเพิ่มอีกแล้วร้านปฏิเสธ → คืนจำนวน ไม่ลบแถว", async () => {
    const { storeId, orderId } = await seedOrderWithSiblingInGroup();
    await addOrderItem(orderId, storeId, NO_GROUP_SKU, 2);
    const sku = await prisma.sku.findUniqueOrThrow({ where: { code: NO_GROUP_SKU } });
    const added = await prisma.orderItem.findFirstOrThrow({ where: { orderId, skuId: sku.id } });
    expect(added.agreedQty).toBe(0);

    const { prismaOrderRepository: repo } = await import("@/lib/repositories/prisma-repository");
    await repo.confirmQtyIncrease(orderId, added.id);
    const r = await repo.updateOrderItemQty(orderId, added.id, 5);
    expect(r.pendingConfirm).toBe(true);

    // ร้านเคยยืนยันแล้ว — ห้ามลบ ต้องคืนเป็น 2 ที่ตกลงไว้
    await expect(removeRejectedAddedItem(orderId, added.id)).rejects.toThrow("ORDER_ITEM_NOT_FOUND");
    await repo.rejectQtyIncrease(orderId, added.id);
    const after = await prisma.orderItem.findUniqueOrThrow({ where: { id: added.id } });
    expect(after.finalQty).toBe(2);
  });

  it("removeRejectedAddedItem ห้ามลบสินค้าที่ร้านสั่งเอง (requestedQty > 0) แม้รอยืนยันอยู่", async () => {
    const { orderId, skuAItemId } = await seedOrderWithSiblingInGroup();
    await prisma.orderItem.update({
      where: { id: skuAItemId },
      data: { finalQty: 8, qtyIncreasePendingConfirm: true },
    });

    await expect(removeRejectedAddedItem(orderId, skuAItemId)).rejects.toThrow(
      "ORDER_ITEM_NOT_FOUND"
    );
    expect(await prisma.orderItem.count({ where: { id: skuAItemId } })).toBe(1);
  });
});
