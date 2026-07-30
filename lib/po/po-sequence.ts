import { prisma } from "@/lib/prisma";
import { bangkokYYMMDD, vdaPoPrefix } from "./po-number";

/**
 * ขอเลขลำดับถัดไปของ (คลัง, วัน) แบบ atomic
 *
 * ใช้ `ON CONFLICT … RETURNING` ของ SQLite (3.35+ ซึ่ง engine ของ Prisma bundle มาให้)
 * แพทเทิร์นเดียวกับ `mint_confirm_no` ใน ocr-po-matching/backend/confirm.py
 * — สำคัญเพราะสองออเดอร์ที่อนุมัติพร้อมกันต้องไม่ได้เลขเดียวกัน
 */
export async function nextPoSequence(
  vdaCode: string,
  date: Date
): Promise<number> {
  const bucket = `${vdaPoPrefix(vdaCode)}-${bangkokYYMMDD(date)}`;
  const rows = await prisma.$queryRaw<{ lastN: number }[]>`
    INSERT INTO "PoSequence" ("bucket", "lastN") VALUES (${bucket}, 1)
    ON CONFLICT("bucket") DO UPDATE SET "lastN" = "lastN" + 1
    RETURNING "lastN"
  `;
  const n = Number(rows[0]?.lastN);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("ขอเลขลำดับ PO ไม่สำเร็จ");
  }
  return n;
}
