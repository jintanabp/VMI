/**
 * ตรวจว่า (division, cusgroup, region) ที่ระบบ resolve ให้แต่ละ VDA
 * ยังหาแถวใน CSV โปรที่โหลดอยู่เจอหรือไม่
 *
 * Usage: npm run verify:promo-context
 *
 * ทำไมต้องมี: ไฟล์โปรอาจโหลดสำเร็จ (isLoaded = true) แต่ key ที่ปลายทางใช้ค้นหา
 * ไม่มีอยู่ในไฟล์เลย → ไม่มีโปรสักตัวทั้งระบบ โดยไม่มี error ที่ไหน
 */
import fs from "fs";
import { getPromotionCsvPath } from "../lib/fabric/paths";
import { PromotionCredit } from "../lib/fabric/promotion-credit";
import { resolvePromoContext } from "../lib/fabric/promotion-context";
import { getStockCoverDirectory } from "../lib/fabric/stock-cover";
import { reloadFabricMasters } from "../lib/fabric";

function vdaCodes(): string[] {
  const map = process.env.C4_VDA_DIVISION_MAP ?? "";
  const codes = map
    .split(",")
    .map((p) => p.split(":")[0]?.trim())
    .filter((c): c is string => Boolean(c));
  return codes.length > 0 ? codes : ["vda1", "vda2", "vda3", "vda4", "vda5"];
}

function main() {
  const csvPath = getPromotionCsvPath();
  console.log(`CSV โปร: ${csvPath}`);
  if (!fs.existsSync(csvPath)) {
    console.error("ไม่พบไฟล์ — รัน npm run sync:masters ก่อน");
    process.exit(1);
  }

  reloadFabricMasters();

  const dir = new PromotionCredit();
  dir.load(csvPath);
  if (!dir.isLoaded) {
    console.error(`โหลดไม่สำเร็จ: ${dir.loadError}`);
    process.exit(1);
  }

  const cover = getStockCoverDirectory();

  let anyMatch = false;
  for (const code of vdaCodes()) {
    const ctx = resolvePromoContext(code);
    // รหัสสินค้าที่ VDA นี้มีจริง — ทดสอบให้ใกล้ของจริงที่สุด
    const productCodes = [
      ...new Set(cover.getForStore(code).map((r) => r.productCode)),
    ].filter((c) => c && !c.startsWith("0"));
    let hit = 0;
    let hitGroup = 0;
    for (const p of productCodes) {
      if (dir.rowsFor(ctx.division, ctx.cusgroup, p).length > 0) hit++;
      const g = dir.assortedGroupFor(ctx.division, ctx.cusgroup, p);
      if (g) hitGroup++;
    }
    if (hit > 0) anyMatch = true;
    const flag = hit === 0 ? "  <<< ไม่เจอโปรเลย" : "";
    console.log(
      `${code.padEnd(6)} division=${ctx.division.padEnd(3)} cusgroup=${ctx.cusgroup.padEnd(4)} region=${ctx.region.padEnd(10)} → ` +
        `SKU ที่มีโปร ${hit}/${productCodes.length} · อยู่ในกลุ่มโปร ${hitGroup}${flag}`
    );
    void productCodes;
  }

  if (!anyMatch) {
    console.log(
      `\n!!! ไม่มี VDA ไหน match โปรได้เลย — ตรวจ C4_DEFAULT_CUSGROUP / C4_VDA_DIVISION_MAP`
    );
    console.log(`    ให้ตรงกับ (DIVISIONSALE|CUSTOMERGROUP) ที่มีจริงในไฟล์`);
    process.exit(2);
  }
}

main();
