import { fabricPromoReady, getPromotionCreditDirectory } from "./index";
import { resolvePromoContext } from "./promotion-context";
import { getStockCoverDirectory } from "./stock-cover";

/**
 * ตรวจตอน boot ว่า (division, cusgroup) ที่ระบบใช้ค้นหา มีอยู่จริงในตาราง C4 ที่โหลดมา
 *
 * โหมดล้มที่อันตรายที่สุดของ C4 คือ "โหลดสำเร็จแต่ไม่ match อะไรเลย" — isLoaded เป็น true
 * ทุกอย่างดูปกติ แต่หน้าเว็บไม่มีโปรสักตัวและไม่มี error ที่ไหน เคยเกิดจริงตอนสลับจาก
 * cft_promotion_credit (S|99, E|99, ...) ไป cft_promotion_cash ซึ่งมีแค่ E|98
 */
export function checkPromoContextCoverage(): void {
  if (!fabricPromoReady()) return;

  const dir = getPromotionCreditDirectory();
  const cover = getStockCoverDirectory();
  if (!cover.isLoaded) return;

  const raw = process.env.C4_VDA_DIVISION_MAP ?? "";
  const codes = raw
    .split(",")
    .map((p) => p.split(":")[0]?.trim())
    .filter((c): c is string => Boolean(c));
  if (codes.length === 0) return;

  const dead: string[] = [];
  for (const code of codes) {
    const ctx = resolvePromoContext(code);
    const products = [
      ...new Set(cover.getForStore(code).map((r) => r.productCode)),
    ].filter((p) => p && !p.startsWith("0"));
    if (products.length === 0) continue;

    const hit = products.some(
      (p) => dir.rowsFor(ctx.division, ctx.cusgroup, p).length > 0
    );
    if (!hit) dead.push(`${code}(${ctx.division}|${ctx.cusgroup})`);
  }

  if (dead.length > 0) {
    console.error(
      `[PromotionCredit] ไม่พบโปรสักตัวสำหรับ: ${dead.join(", ")} — ` +
        `ตรวจ C4_DEFAULT_DIVISION / C4_DEFAULT_CUSGROUP / C4_VDA_DIVISION_MAP ` +
        `ให้ตรงกับ DIVISIONSALE|CUSTOMERGROUP ที่มีจริงในไฟล์ ` +
        `(รัน npm run verify:promo-context เพื่อดูรายละเอียด)`
    );
  }
}
