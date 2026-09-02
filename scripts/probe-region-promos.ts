/**
 * โปรเฉพาะภาคเดือนนี้ตกอยู่กับ SKU ไหน และคลังไหนสต็อกไว้บ้าง
 *
 * Usage: npx tsx --env-file=.env scripts/probe-region-promos.ts
 *
 * ตอบคำถามเดียว: "ร้านที่อยู่คนละภาคกับคลัง จะเห็นโปรต่างจากที่แอดมินเห็นตรงไหน"
 * — แถวที่ติดภาคเดียว (ไม่ใช่ COUNTRY) และให้สิทธิประโยชน์จริง คือจุดเดียวที่ต่างได้
 */
import fs from "fs";
import { getPromotionCsvPath } from "../lib/fabric/paths";
import { PromotionCredit, REGIONS } from "../lib/fabric/promotion-credit";
import { getStockCoverDirectory } from "../lib/fabric/stock-cover";
import { reloadFabricMasters } from "../lib/fabric";

function hasBenefit(r: {
  premiumProduct: string;
  premiumQty: number;
  discAmt: number;
  discPct: number;
}): boolean {
  const prem =
    r.premiumProduct &&
    r.premiumProduct.toUpperCase() !== "NULL" &&
    r.premiumProduct !== "0" &&
    r.premiumQty > 0;
  return Boolean(prem) || r.discAmt > 0 || r.discPct > 0;
}

function main() {
  const csvPath = getPromotionCsvPath();
  if (!fs.existsSync(csvPath)) {
    console.error("ไม่พบไฟล์โปร — รัน npm run sync:masters ก่อน");
    process.exit(1);
  }
  reloadFabricMasters();

  const dir = new PromotionCredit();
  dir.load(csvPath);

  const today = new Date();
  const month = today.toISOString().slice(0, 7);

  const rows = dir
    .allRows()
    .filter((r) => !r.regions.has("COUNTRY") && r.regions.size > 0)
    .filter(hasBenefit);

  console.log(`เดือน ${month} · แถวเฉพาะภาคที่ให้สิทธิประโยชน์ ${rows.length} แถว\n`);

  const stock = getStockCoverDirectory();
  const catalogs = new Map<string, Set<string>>();
  for (const code of ["vda1", "vda2", "vda3", "vda4", "vda5"]) {
    catalogs.set(
      code,
      new Set(stock.getForStore(code).map((r) => r.productCode))
    );
  }

  for (const region of REGIONS) {
    const hit = rows.filter((r) => r.regions.has(region));
    if (hit.length === 0) continue;
    const skus = [...new Set(hit.map((r) => r.product))];
    const stocked = skus.filter((s) =>
      [...catalogs.values()].some((c) => c.has(s))
    );
    console.log(
      `${region.padEnd(10)} ${String(hit.length).padStart(3)} แถว · ${skus.length} SKU · คลังในระบบสต็อกไว้ ${stocked.length} SKU`
    );
    if (stocked.length > 0) {
      for (const sku of stocked.slice(0, 10)) {
        const where = [...catalogs.entries()]
          .filter(([, c]) => c.has(sku))
          .map(([k]) => k)
          .join(",");
        const also = dir
          .allRows()
          .some(
            (r) => r.product === sku && r.regions.has("COUNTRY") && hasBenefit(r)
          );
        console.log(
          `   ${sku} อยู่ใน ${where}${also ? " · มีแถว COUNTRY ที่ให้สิทธิด้วย" : " · ไม่มีแถว COUNTRY"}`
        );
      }
    }
  }
}

main();
