import { getCvdFlag } from "@/lib/calculations";

/**
 * ตรรกะล้วนของหน้าภาพรวมฝั่งเซลล์ — ไม่แตะฐานข้อมูล เพื่อให้เทสต์ได้ตรง ๆ
 *
 * สำคัญ: การนับ "ธงแดง" ต้องใช้ `getCvdFlag` ตัวเดียวกับที่หน้าตรวจออเดอร์ใช้
 * (`orderRedFlagCount` ใน components/sales/sales-orders-client.tsx) ห้ามเขียนสูตร
 * ซ้ำเป็น SQL — เกณฑ์สีธงมีเคสพิเศษหลายชั้นและมีเทสต์ (tests/cvd-flag.test.ts)
 * คุมอยู่ ถ้าแตกสูตรเป็นสองที่ ตัวเลขบนแดชบอร์ดจะเถียงกับตัวเลขในหน้าออเดอร์
 */

/** แถวดิบที่ต้องใช้ — เลือกเฉพาะ 3 ตัวเลขนี้พอ ไม่ต้อง join Sku */
export interface RedFlagItemRow {
  storeId: string;
  storeCode: string;
  storeName: string;
  cvdEstimate: number | null;
  minDays: number | null;
  maxDays: number | null;
}

export interface RedFlagStore {
  storeId: string;
  storeCode: string;
  storeName: string;
  /** จำนวนบรรทัดธงแดง */
  redCount: number;
  /** จำนวนบรรทัดทั้งหมดของร้านนี้ในช่วงที่ดู */
  totalCount: number;
  /** สัดส่วนธงแดง 0-100 */
  redPct: number;
}

export function isRedFlag(row: {
  cvdEstimate: number | null;
  minDays: number | null;
  maxDays: number | null;
}): boolean {
  return (
    getCvdFlag(
      row.cvdEstimate,
      row.minDays ?? undefined,
      row.maxDays ?? undefined
    ) === "red"
  );
}

/**
 * จัดอันดับร้านที่มีบรรทัดธงแดงมากที่สุด
 *
 * เรียงด้วยจำนวนก่อน แล้วค่อยสัดส่วน แล้วค่อยรหัสร้าน — ให้ลำดับนิ่ง ไม่สลับไปมา
 * ระหว่างรีเฟรชเมื่อค่าเท่ากัน · ร้านที่ไม่มีธงแดงเลยไม่ต้องอยู่ในอันดับ
 */
export function rankRedFlagStores(
  rows: RedFlagItemRow[],
  limit = 10
): RedFlagStore[] {
  const byStore = new Map<string, RedFlagStore>();

  for (const row of rows) {
    let entry = byStore.get(row.storeId);
    if (!entry) {
      entry = {
        storeId: row.storeId,
        storeCode: row.storeCode,
        storeName: row.storeName,
        redCount: 0,
        totalCount: 0,
        redPct: 0,
      };
      byStore.set(row.storeId, entry);
    }
    entry.totalCount += 1;
    if (isRedFlag(row)) entry.redCount += 1;
  }

  return [...byStore.values()]
    .map((s) => ({
      ...s,
      redPct: s.totalCount > 0 ? (s.redCount / s.totalCount) * 100 : 0,
    }))
    .filter((s) => s.redCount > 0)
    .sort(
      (a, b) =>
        b.redCount - a.redCount ||
        b.redPct - a.redPct ||
        a.storeCode.localeCompare(b.storeCode)
    )
    .slice(0, limit);
}

export interface ApprovalRate {
  approved: number;
  rejected: number;
  /** จำนวนออเดอร์ที่ "ตัดสินแล้ว" = ตัวหารของอัตราอนุมัติ */
  decided: number;
  /** null เมื่อยังไม่มีออเดอร์ที่ตัดสิน — ต่างจาก 0% */
  ratePct: number | null;
}

/**
 * อัตราอนุมัติจากผลนับตามสถานะ
 *
 * ตัวหารนับเฉพาะออเดอร์ที่พนักงาน "ตัดสินแล้ว" (อนุมัติ + ปฏิเสธ) ไม่รวมที่ยังรอตรวจ
 * และไม่รวมออเดอร์ที่ร้านถอนเอง — ร้านยกเลิกคือการลบแถวทิ้ง (hard delete) ออเดอร์
 * พวกนั้นจึงไม่เหลืออยู่ในฐานข้อมูลให้นับตั้งแต่แรก ต้องบอกผู้ใช้ไว้บนการ์ด
 */
export function calcApprovalRate(counts: {
  approved?: number;
  rejected?: number;
}): ApprovalRate {
  const approved = counts.approved ?? 0;
  const rejected = counts.rejected ?? 0;
  const decided = approved + rejected;
  return {
    approved,
    rejected,
    decided,
    ratePct: decided > 0 ? (approved / decided) * 100 : null,
  };
}
