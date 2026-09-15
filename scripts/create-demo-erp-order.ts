/**
 * สร้างออเดอร์ทดสอบ + อนุมัติเป็น PO — ไว้ลองกดส่งเข้า ERP (UAT) ตอนได้รับอนุญาต
 *
 * **ไม่ยิงอะไรออกเน็ตเลย** แค่สร้างข้อมูลในฐานข้อมูลเครื่องนี้ — เหตุผลที่ต้องมีสคริปต์นี้:
 * PO 4 ใบที่มีอยู่เดิมใช้ทดสอบส่ง ERP ไม่ได้ (ออกก่อนมีช่องวันรับของ + เอกสารเป็นสแนปช็อต
 * ณ วันอนุมัติ แก้ออเดอร์ทีหลังไม่ช่วย) จึงต้องมีออเดอร์ใหม่ที่มี deliveryDate จริง ๆ
 *
 * ราคา/SKU ในนี้เป็นตัวเลขสมมติ (ไม่ใช่ราคา C4 จริง) — จุดประสงค์คือให้ payload ผ่าน
 * checkErpReadiness ครบทุกช่อง ไม่ใช่ทดสอบความถูกต้องของราคา
 *
 * Usage: npx tsx --env-file=.env scripts/create-demo-erp-order.ts [vdaCode] [--special]
 * (ค่าเริ่มต้น vda1) — `--special` ทำให้บรรทัดแรกราคาไม่ตรง C4 (priceFlagged) และมีของแถม
 * เพื่อทดสอบเส้นทาง isSpecial=Y/isErrorC4=Y + บรรทัด F (ดูข้อ 4.3 ใน docs/ERP-PO-PLAN.md)
 */
import { prisma } from "../lib/prisma";
import { warmFabricMasters, fabricSkuMasterReady } from "../lib/fabric";
import {
  refreshVdaWarehouseCache,
  listVdaWarehouses,
} from "../lib/fabric/vda-warehouse-registry";
import { buildVdaSalesDirectory } from "../lib/admin/vda-sales-directory";
import { normalizeStoreKey } from "../lib/fabric/store-key";
import { skuVatStatus } from "../lib/po/sku-vat-status";
import { getRepositories } from "../lib/repositories";
import { approveWithPoSplit } from "../lib/po/approve-with-split";
import { defaultDeliveryDate } from "../lib/orders/delivery-date";

async function main() {
  const args = process.argv.slice(2);
  const special = args.includes("--special");
  const vdaCode = (args.find((a) => !a.startsWith("--")) || "vda1").toLowerCase();

  // ลำดับสำคัญเหมือน instrumentation.ts — ทะเบียนคลังต้องมาก่อน master
  console.log("โหลดทะเบียนคลังและ master ก่อน...");
  await refreshVdaWarehouseCache();
  warmFabricMasters();

  const store = await prisma.store.findUnique({ where: { code: vdaCode } });
  if (!store) {
    console.error(`ไม่พบร้าน/คลังรหัส ${vdaCode} ในฐานข้อมูล`);
    process.exit(1);
  }

  const key = normalizeStoreKey(vdaCode);
  const customerCode =
    listVdaWarehouses().find((w) => normalizeStoreKey(w.code) === key)
      ?.customerCodes[0] ?? "";
  const salesmanCode =
    buildVdaSalesDirectory().vdas.find((v) => normalizeStoreKey(v.vda) === key)
      ?.salesmanCodes[0] ?? "";

  if (!customerCode || !salesmanCode) {
    console.error(
      `${vdaCode} ยังไม่มีรหัสลูกค้า/รหัสเซลส์ในทะเบียน (customerCode=${customerCode || "-"} salesmanCode=${salesmanCode || "-"}) — ตั้งค่าที่ /admin/vda ก่อน`
    );
    process.exit(1);
  }
  if (!fabricSkuMasterReady()) {
    console.error("SKU master ยังไม่พร้อม (item_barcode_map_v2.csv) — ตรวจ data/cache ก่อน");
    process.exit(1);
  }

  // เลือก SKU จริงจาก DB 2 ตัวที่รู้ VatStatus แน่นอน และไม่ใช่รหัสของแถม (ขึ้นต้นด้วย 0)
  const candidates = await prisma.sku.findMany({
    where: { NOT: { code: { startsWith: "0" } } },
    take: 50,
    select: { id: true, code: true, name: true },
  });
  const chosen = candidates
    .filter((s) => skuVatStatus(s.code) !== null)
    .slice(0, 2);
  if (chosen.length < 2) {
    console.error("หา SKU ที่รู้ VatStatus ไม่ครบ 2 ตัว — ตรวจ SKU master");
    process.exit(1);
  }

  const deliveryDate = defaultDeliveryDate();

  const { orders } = getRepositories();
  const { id: orderId } = await orders.createOrder(
    store.id,
    chosen.map((sku, i) => {
      const isFirstAndSpecial = special && i === 0;
      return {
        skuId: sku.id,
        suggestedQty: 2,
        finalQty: 2,
        cvdEstimate: null,
        // ราคาสมมติ — ไม่ใช่ราคา C4 จริงของ SKU นี้ ใช้แค่ให้ payload ครบช่อง
        c4UnitPrice: 500 + i * 100,
        // --special: ร้าน/เซลส์ตั้งราคาไม่ตรง C4 บรรทัดแรก เพื่อทดสอบ isSpecial=Y/isErrorC4=Y
        unitPriceOverride: isFirstAndSpecial ? 550 + i * 100 : null,
        c4DiscountBaht: null,
        c4DiscountPct: null,
        c4NetUnitPrice: null,
        c4PriceExpired: false,
        priceFlagged: isFirstAndSpecial,
        priceFlagReason: isFirstAndSpecial ? "mismatch" : null,
        // --special: ของแถมสมมติผูกกับบรรทัดแรก — ทดสอบตัวแปลงบรรทัด F
        c4PromoLabel: isFirstAndSpecial ? "ซื้อ 2 แถม 1 (ทดสอบ)" : null,
        c4PromoKind: isFirstAndSpecial ? "premium" : null,
        c4FreeGoodCode: isFirstAndSpecial ? chosen[1]!.code : null,
        c4FreeGoodName: isFirstAndSpecial ? chosen[1]!.name : null,
        c4FreeGoodQty: isFirstAndSpecial ? 1 : null,
        c4FreeGoodUnit: isFirstAndSpecial ? "ชิ้น" : null,
      };
    }),
    undefined,
    deliveryDate
  );
  console.log(
    `สร้างออเดอร์ทดสอบแล้ว: ${orderId} (deliveryDate ${deliveryDate}${special ? ", special deal" : ""})`
  );

  const result = await approveWithPoSplit(orderId, "demo-script@vmi.local", {});
  console.log("อนุมัติแล้ว ออก PO:");
  for (const po of result.purchaseOrders) {
    console.log(
      `  - ${po.poNumber} (${po.priceKind}) ${po.itemCount} รายการ ${po.totalQty} หีบ รวม ${po.totalAmount} บาท`
    );
  }
  console.log(
    `ลูกค้า ${customerCode} · เซลส์ ${salesmanCode} · division E · รับของ ${deliveryDate}`
  );
  console.log(
    "ดูได้ที่หน้า /sales/po — payload ผ่าน checkErpReadiness แล้ว แต่ยังไม่ได้กดส่งเข้า ERP (ต้องกดเองในหน้าเว็บ)"
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
