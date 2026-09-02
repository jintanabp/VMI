/**
 * โปรที่ร้านเห็นในหน้าสั่งของ ตรงกับโปรที่แอดมิน/เซลล์เห็นไหม
 *
 * Usage: npm run verify:promo-parity
 *
 * สองหน้านี้อ่านไฟล์ C4 ใบเดียวกันแต่คนละเส้นทาง จึงเพี้ยนกันได้โดยไม่มี error:
 *
 *   ฝั่งร้าน (lib/fabric/stock-rows.ts)   filterCandidateRows = แถวที่ active "วันนี้"
 *                                        + ตรงภาคของคลัง แล้ว preferInsertedWindow
 *                                        เลือกช่วงที่แทรกล่าสุดมาช่วงเดียว
 *   ฝั่งแอดมิน (lib/promo/promo-month.ts) ทุกแถวที่ "ทับซ้อนกับเดือนนี้" ในบริบทของคลัง
 *                                        แยกถังตามช่วงวันที่ ติดธง activeNow ไว้
 *
 * สคริปต์นี้เทียบ "ขั้นบันไดที่ได้จริง" ของแต่ละ SKU จากทั้งสองเส้นทาง โดยดูเฉพาะ
 * ถังที่ activeNow (คือสิ่งที่ควรตรงกับหน้าร้านวันนี้) แล้วแยกรายงานเป็น 4 กอง:
 *
 *   ตรงกัน · ขั้นไม่ตรง · แอดมินมีแต่ร้านไม่ขึ้น · ร้านขึ้นแต่แอดมินไม่มี
 *
 * "แอดมินมี แต่ SKU ไม่มีในสต็อกของคลัง" นับแยกอีกกอง — ไม่ใช่บั๊ก แต่เป็นคำตอบของ
 * คำถาม "ทำไมแอดมินเห็นโปรตัวนี้แต่ร้านไม่เห็น" ที่ต้องแยกออกจากของที่ผิดจริง
 */
import { reloadFabricMasters } from "../lib/fabric";
import {
  fabricPromoReady,
  fabricSkuMasterReady,
  getPromotionCreditDirectory,
  getSkuMasterDirectory,
} from "../lib/fabric";
import { isBenefitTier, type PromoTierInput } from "../lib/calculations";
import { resolvePromoContext } from "../lib/fabric/promotion-context";
import {
  filterCandidateRows,
  promoRowsToTiers,
} from "../lib/fabric/promotion-lookup";
import { getStockCoverDirectory } from "../lib/fabric/stock-cover";
import { listStockFromDbSources } from "../lib/fabric/stock-rows";
import { reloadVdaAosBillRegistry } from "../lib/fabric/vda-aos-bill";
import { initVdaWarehouseRegistry } from "../lib/fabric/vda-warehouse-registry";
import { buildPromoMonthReport } from "../lib/promo/promo-month";

/** ลายเซ็นของบันไดโปร — เทียบได้ตรง ๆ ว่าสองฝั่งให้เงื่อนไขเดียวกันไหม */
function tierSig(tiers: PromoTierInput[]): string {
  return tiers
    .filter(isBenefitTier)
    .slice()
    .sort((a, b) => a.minQty - b.minQty)
    .map((t) =>
      [
        t.minQty,
        t.kind ?? "none",
        t.discBaht ?? "",
        t.discPct ?? "",
        t.premiumProduct ?? "",
        t.premiumQty ?? "",
        t.premiumUnit ?? "",
      ].join(":")
    )
    .join(" | ");
}

/** SKU ที่คลังนี้มีแถวสต็อกจริง — หน้าร้านสร้างแถวจากตรงนี้เท่านั้น */
function productsOf(code: string): Set<string> {
  return new Set(
    getStockCoverDirectory()
      .getForStore(code)
      .map((r) => r.productCode)
      .filter((c) => c && !c.startsWith("0"))
  );
}

async function main() {
  reloadFabricMasters();

  /**
   * ต้องดึงทะเบียนคลังจาก DB ก่อน ไม่งั้น "ภาค" ของทุกคลังถอยไปเป็น COUNTRY
   *
   * ภาคมาจากรหัสลูกค้าที่ผูกกับคลัง (หน้า /admin/data/warehouses) ซึ่งเก็บใน DB
   * และโหลดแบบ async ตอน boot ของเว็บ — สคริปต์ไม่ได้ผ่าน instrumentation จึงต้อง
   * เรียกเอง มิฉะนั้นสคริปต์จะเทียบสองฝั่งด้วยภาคที่ผิดเหมือนกันทั้งคู่ แล้วขึ้นเขียว
   * ทั้งที่ยังไม่ได้ตรวจโปรเฉพาะภาคเลยสักแถว
   */
  await initVdaWarehouseRegistry();
  reloadVdaAosBillRegistry();

  if (!fabricPromoReady()) {
    console.error("ไฟล์โปรยังไม่พร้อม — รัน npm run sync:masters ก่อน");
    process.exit(1);
  }

  const promoDir = getPromotionCreditDirectory();
  const skuDir = fabricSkuMasterReady() ? getSkuMasterDirectory() : null;
  const stores = listStockFromDbSources();

  if (stores.length === 0) {
    console.error("ไม่มีคลังในระบบ (stock cover ยังไม่โหลด)");
    process.exit(1);
  }

  let totalMismatch = 0;
  let totalMissingAtStore = 0;
  let totalExtraAtStore = 0;

  for (const code of stores) {
    const ctx = resolvePromoContext(code);
    const report = buildPromoMonthReport({ storeCodes: [code] });
    const inStock = productsOf(code);

    // ฝั่งแอดมิน: เฉพาะถังที่ใช้ได้วันนี้และให้สิทธิประโยชน์จริง
    const adminTiers = new Map<string, PromoTierInput[]>();
    for (const g of report.groups) {
      if (!g.activeNow || !g.hasBenefit) continue;
      for (const s of g.skus) adminTiers.set(s.code, g.tiers);
    }

    // ฝั่งร้าน: เส้นทางเดียวกับ stock-rows.ts เป๊ะ
    const storeTiers = new Map<string, PromoTierInput[]>();
    for (const product of inStock) {
      const rows = filterCandidateRows(
        promoDir,
        ctx.division,
        ctx.cusgroup,
        product,
        ctx.region
      );
      if (rows.length === 0) continue;
      const tiers = promoRowsToTiers(rows, {
        packSizeOf: (c) => skuDir?.packSizeForSku(c) ?? 1,
        nameOf: (c) => skuDir?.nameForSku(c) ?? "",
      });
      if (tiers.some(isBenefitTier)) storeTiers.set(product, tiers);
    }

    const same: string[] = [];
    const differ: string[] = [];
    const onlyAdminInStock: string[] = [];
    const onlyAdminNoStock: string[] = [];
    const onlyStore: string[] = [];

    for (const [sku, tiers] of adminTiers) {
      const mine = storeTiers.get(sku);
      if (!mine) {
        if (inStock.has(sku)) onlyAdminInStock.push(sku);
        else onlyAdminNoStock.push(sku);
        continue;
      }
      if (tierSig(tiers) === tierSig(mine)) same.push(sku);
      else differ.push(sku);
    }
    for (const sku of storeTiers.keys()) {
      if (!adminTiers.has(sku)) onlyStore.push(sku);
    }

    totalMismatch += differ.length;
    totalMissingAtStore += onlyAdminInStock.length;
    totalExtraAtStore += onlyStore.length;

    console.log(
      `\n== ${code} == division=${ctx.division} cusgroup=${ctx.cusgroup} region=${ctx.region || "(ไม่รู้)"}`
    );
    console.log(
      `   SKU ในสต็อก ${inStock.size} · แอดมินโชว์โปรที่ใช้ได้วันนี้ ${adminTiers.size} SKU · ร้านโชว์ ${storeTiers.size} SKU`
    );
    console.log(
      `   ตรงกัน ${same.length} · ขั้นไม่ตรง ${differ.length} · แอดมินมีแต่ร้านไม่ขึ้น ${onlyAdminInStock.length} (ไม่มีในสต็อกอีก ${onlyAdminNoStock.length}) · ร้านขึ้นแต่แอดมินไม่มี ${onlyStore.length}`
    );

    for (const sku of differ.slice(0, 5)) {
      console.log(`   [ขั้นไม่ตรง] ${sku}`);
      console.log(`      แอดมิน: ${tierSig(adminTiers.get(sku)!) || "(ไม่มีขั้นที่ให้ประโยชน์)"}`);
      console.log(`      ร้าน  : ${tierSig(storeTiers.get(sku)!) || "(ไม่มีขั้นที่ให้ประโยชน์)"}`);
    }
    if (differ.length > 5) console.log(`      … อีก ${differ.length - 5} รหัส`);

    if (onlyAdminInStock.length > 0) {
      console.log(`   [แอดมินมี ร้านไม่ขึ้น] ${onlyAdminInStock.slice(0, 10).join(", ")}`);
    }
    if (onlyStore.length > 0) {
      console.log(`   [ร้านขึ้น แอดมินไม่มี] ${onlyStore.slice(0, 10).join(", ")}`);
    }
  }

  console.log(
    `\nสรุป: ขั้นไม่ตรง ${totalMismatch} · แอดมินมีแต่ร้านไม่ขึ้น ${totalMissingAtStore} · ร้านขึ้นแต่แอดมินไม่มี ${totalExtraAtStore}`
  );
  if (totalMismatch + totalMissingAtStore + totalExtraAtStore === 0) {
    console.log("สองหน้าตรงกันทุก SKU ที่คลังมีของ");
  }
}

void main();
