/**
 * ตรวจว่า (division, cusgroup, region) ที่ระบบ resolve ให้แต่ละคลัง VDA และแต่ละร้านค้า
 * ยังหาแถวใน CSV โปรที่โหลดอยู่เจอหรือไม่
 *
 * Usage: npm run verify:promo-context
 *
 * ทำไมต้องมี: ไฟล์โปรอาจโหลดสำเร็จ (isLoaded = true) แต่ key ที่ปลายทางใช้ค้นหา
 * ไม่มีอยู่ในไฟล์เลย → ไม่มีโปรสักตัวทั้งระบบ โดยไม่มี error ที่ไหน
 *
 * ต้องไล่ "รหัสร้านค้าจริง" ด้วย ไม่ใช่แค่ vda1-5: เคยเกิดจริงว่า VDA ทุกตัวผ่านหมด
 * (E|98 ตรงกับไฟล์) แต่ร้านค้าทุกร้าน resolve เป็น cusgroup 99 จาก dim_customer
 * แล้วไม่เจอโปรสักแถว — สคริปต์เดิมเช็คแต่ VDA จึงขึ้นเขียวทั้งที่ร้านไม่เห็นโปรเลย
 */
import fs from "fs";
import { prisma } from "../lib/prisma";
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

/** SKU ที่คลังนี้มีจริง — ทดสอบให้ใกล้ของจริงที่สุด (ของแถมรหัสขึ้นต้น 0 ไม่นับ) */
function productsOf(code: string): string[] {
  return [
    ...new Set(getStockCoverDirectory().getForStore(code).map((r) => r.productCode)),
  ].filter((c) => c && !c.startsWith("0"));
}

function coverage(
  dir: PromotionCredit,
  ctx: { division: string; cusgroup: string },
  products: string[]
): { hit: number; hitGroup: number } {
  let hit = 0;
  let hitGroup = 0;
  for (const p of products) {
    if (dir.rowsFor(ctx.division, ctx.cusgroup, p).length > 0) hit++;
    if (dir.assortedGroupFor(ctx.division, ctx.cusgroup, p)) hitGroup++;
  }
  return { hit, hitGroup };
}

async function main() {
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

  const contextsInFile = [
    ...new Set(dir.allRows().map((r) => `${r.division}|${r.cusgroup}`)),
  ];
  console.log(`บริบทที่มีในไฟล์: ${contextsInFile.join(", ")}\n`);

  const dead: string[] = [];
  let anyMatch = false;

  console.log("— คลัง VDA —");
  for (const code of vdaCodes()) {
    const ctx = resolvePromoContext(code);
    const products = productsOf(code);
    if (products.length === 0) continue;
    const { hit, hitGroup } = coverage(dir, ctx, products);
    if (hit > 0) anyMatch = true;
    else dead.push(code);
    console.log(
      `${code.padEnd(6)} division=${ctx.division.padEnd(3)} cusgroup=${ctx.cusgroup.padEnd(4)} region=${ctx.region.padEnd(10)} → ` +
        `SKU ที่มีโปร ${hit}/${products.length} · อยู่ในกลุ่มโปร ${hitGroup}${hit === 0 ? "  <<< ไม่เจอโปรเลย" : ""}`
    );
  }

  /**
   * ร้านค้าจริงจาก DB — บริบทของร้านมาจากคลังที่จ่ายของ (resolvePromoContext)
   * จึงต้องเช็คด้วยรหัสร้านจริง ไม่ใช่สมมติว่าเหมือน VDA
   */
  const stores = await prisma.store.findMany({ select: { code: true } });
  const vdaSet = new Set(vdaCodes().map((c) => c.toLowerCase()));
  const storeCodes = stores
    .map((s) => s.code)
    .filter((c) => !vdaSet.has(c.trim().toLowerCase()));

  console.log(`\n— ร้านค้าใน DB (${storeCodes.length} ร้าน) —`);
  if (storeCodes.length === 0) {
    console.log("(ยังไม่มีร้านค้าใน DB)");
  }

  // ร้านส่วนใหญ่ resolve ไปคลังเดียวกัน — ยุบเป็นบรรทัดเดียวต่อบริบท ไม่งั้นยาวเป็นหน้า
  const byCtx = new Map<string, { ctx: ReturnType<typeof resolvePromoContext>; codes: string[] }>();
  for (const code of storeCodes) {
    const ctx = resolvePromoContext(code);
    const key = `${ctx.vdaCode ?? "-"}|${ctx.division}|${ctx.cusgroup}|${ctx.region}`;
    const entry = byCtx.get(key) ?? { ctx, codes: [] };
    entry.codes.push(code);
    byCtx.set(key, entry);
  }

  for (const { ctx, codes } of byCtx.values()) {
    // SKU ที่ร้านเห็นจริงมาจากคลังที่จ่ายของ
    const products = productsOf(ctx.vdaCode ?? codes[0]!);
    const { hit, hitGroup } = coverage(dir, ctx, products);
    if (hit > 0) anyMatch = true;
    else dead.push(...codes);
    console.log(
      `${codes.length} ร้าน → คลัง ${(ctx.vdaCode ?? "-").padEnd(5)} division=${ctx.division.padEnd(3)} cusgroup=${ctx.cusgroup.padEnd(4)} region=${ctx.region.padEnd(10)} → ` +
        `SKU ที่มีโปร ${hit}/${products.length} · อยู่ในกลุ่มโปร ${hitGroup}${hit === 0 ? "  <<< ไม่เจอโปรเลย" : ""}`
    );
    if (hit === 0) console.log(`   ร้านที่กระทบ: ${codes.join(", ")}`);
  }

  if (dead.length > 0) {
    console.error(
      `\n!!! ไม่เจอโปรสักตัวสำหรับ: ${dead.join(", ")}\n` +
        `    ตรวจ C4_DEFAULT_DIVISION / C4_DEFAULT_CUSGROUP / C4_VDA_DIVISION_MAP\n` +
        `    ให้ตรงกับ (DIVISIONSALE|CUSTOMERGROUP) ที่มีจริงในไฟล์: ${contextsInFile.join(", ")}`
    );
    process.exit(2);
  }

  if (!anyMatch) {
    console.error("\n!!! ไม่มีใคร match โปรได้เลย");
    process.exit(2);
  }

  console.log("\nผ่าน — ทุกคลังและทุกร้านหาโปรเจอ");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
