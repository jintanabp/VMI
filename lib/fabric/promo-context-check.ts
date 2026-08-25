import { measurePromoCoverage } from "./promo-coverage";

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
