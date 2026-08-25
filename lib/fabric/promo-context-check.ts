import { fabricPromoReady, getPromotionCreditDirectory } from "./index";
import { measurePromoCoverage } from "./promo-coverage";
import { resolvePromoContext } from "./promotion-context";
import { listStockFromDbSources } from "./stock-rows";

/**
 * ตรวจตอน boot ว่า (division, cusgroup) ที่ระบบใช้ค้นหา มีอยู่จริงในตาราง C4 ที่โหลดมา
 *
 * โหมดล้มที่อันตรายที่สุดของ C4 คือ "โหลดสำเร็จแต่ไม่ match อะไรเลย" — isLoaded เป็น true
 * ทุกอย่างดูปกติ แต่หน้าเว็บไม่มีโปรสักตัวและไม่มี error ที่ไหน เคยเกิดจริงตอนสลับจาก
 * cft_promotion_credit (S|99, E|99, ...) ไป cft_promotion_cash ซึ่งมีแค่ E|98
 *
 * รายชื่อคลังที่ไล่ตรวจมาจาก measurePromoCoverage() ตัวเดียวกับที่ยามตอน sync ใช้
 * เดิมตัวนี้อ่าน C4_VDA_DIVISION_MAP เองแล้ว `return` เงียบเมื่อ env ว่าง ซึ่งกลับหัวกลับหาง:
 * env ที่ไม่ได้ตั้งคือหนึ่งในสาเหตุของอาการที่ยามตัวนี้ถูกสร้างมาดัก มันจึงปิดปากตัวเอง
 * พอดีในรอบที่ต้องส่งเสียงดังที่สุด ตอนนี้ถอยไปใช้คลังที่มีจริงใน stock cover แทน
 */
export function checkPromoContextCoverage(): void {
  checkPromoFileIsTheCashTable();

  const coverage = measurePromoCoverage();
  if (!coverage) return;

  const dead = Object.entries(coverage.byStore)
    .filter(([, c]) => c.withPromo === 0)
    .map(([store, c]) => `${store}(0/${c.checked})`);

  if (dead.length > 0) {
    console.error(
      `[PromotionCredit] ไม่พบโปรสักตัวสำหรับ: ${dead.join(", ")} — ` +
        `บริบทที่มีในไฟล์: ${coverage.contextsInFile.join(", ") || "(ไม่มี)"} — ` +
        `ตรวจ C4_DEFAULT_DIVISION / C4_DEFAULT_CUSGROUP / C4_VDA_DIVISION_MAP ` +
        `ให้ตรงกับ DIVISIONSALE|CUSTOMERGROUP ที่มีจริงในไฟล์ ` +
        `(รัน npm run verify:promo-context เพื่อดูรายละเอียด)`
    );
    return;
  }

  console.info(
    `[PromotionCredit] โปรพร้อมใช้ — SKU ที่มีโปร ${coverage.skusWithPromo}/${coverage.skusChecked} ` +
      `จาก ${Object.keys(coverage.byStore).length} คลัง`
  );
}

/**
 * ไฟล์ที่โหลดมาใช่ตาราง cash จริงหรือเปล่า
 *
 * cft_promotion_cash.csv มีบริบทเดียวคือ E|98 ทั้งไฟล์ ส่วน cft_promotion_credit.csv
 * (ตารางเก่าที่เลิกใช้แล้ว) มี 7-8 ชุด จำนวนบริบทจึงแยกสองไฟล์นี้ออกจากกันได้ทันที
 *
 * ต้องเช็คแยกจากการนับ SKU ที่มีโปร: ตอนหยิบไฟล์ credit มาผิดใบบน production
 * บริบทที่ resolve ได้คือ S|99 ซึ่ง**มีอยู่จริง**ในไฟล์นั้น โปรจึงขึ้นบางตัวและยามที่นับ
 * ความครอบคลุมก็เงียบสนิท ทั้งที่ทั้งระบบกำลังใช้ตารางผิดใบอยู่
 */
function checkPromoFileIsTheCashTable(): void {
  if (!fabricPromoReady()) return;
  const ctxs = getPromotionCreditDirectory().contexts();
  if (ctxs.length <= 1) return;

  const label = ctxs.map((c) => `${c.division}|${c.cusgroup}`).join(", ");
  console.error(
    `[PromotionCredit] ไฟล์โปรมี ${ctxs.length} บริบท (${label}) — ตาราง C4 cash ต้องมีชุดเดียว ` +
      `นี่คือลายนิ้วมือของ cft_promotion_credit.csv (ตารางเก่า) ` +
      `ตรวจ CFT_WORKSPACE_ID / CFT_LAKEHOUSE_ID / CFT_ONELAKE_PATH ว่าชี้ไฟล์ถูกใบหรือไม่`
  );

  // บริบทที่ระบบจะใช้จริง อยู่ในไฟล์นั้นไหม — ถ้าไม่อยู่ ร้านจะไม่เห็นโปรเลยสักตัว
  const inFile = new Set(ctxs.map((c) => `${c.division}|${c.cusgroup}`));
  for (const store of listStockFromDbSources()) {
    const ctx = resolvePromoContext(store);
    const key = `${ctx.division}|${ctx.cusgroup}`;
    if (!inFile.has(key)) {
      console.error(
        `[PromotionCredit] ${store} จะค้นด้วย ${key} ซึ่งไม่มีอยู่ในไฟล์เลย — โปรจะไม่ขึ้นทั้งคลังนี้`
      );
    }
  }
}
