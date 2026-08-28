import type { SalesSession } from "@/lib/auth/sales-session";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";

/**
 * คลังที่ผู้ใช้คนนี้มีสิทธิ์ดูโปร
 *
 * แยกเป็นฟังก์ชันบริสุทธิ์ (รับรายชื่อคลังทั้งหมดเข้ามา) เพื่อให้เทสต์กติกาสิทธิ์ได้
 * โดยไม่ต้องมีไฟล์ master หรือฐานข้อมูล
 */
export type PromoScope =
  | { kind: "all"; storeCodes: string[] }
  | { kind: "scoped"; storeCodes: string[] }
  | { kind: "none" };

export function resolvePromoVdaScope(
  session: SalesSession | null,
  allStoreCodes: string[],
  ownedVdaCodes: string[]
): PromoScope {
  if (!session) return { kind: "none" };
  if (session.role === "admin") {
    return { kind: "all", storeCodes: allStoreCodes };
  }

  const owned = new Set(ownedVdaCodes.map((c) => c.toLowerCase()));
  const allowed = allStoreCodes.filter((c) => owned.has(c.toLowerCase()));
  return allowed.length > 0
    ? { kind: "scoped", storeCodes: allowed }
    : { kind: "none" };
}

/**
 * คลังที่จะใช้สร้างรายงานจริง หลังเอาคำขอของผู้ใช้มาตัดกับสิทธิ์
 *
 * คืน `null` = ขอคลังที่ไม่มีสิทธิ์ (ผู้เรียกตอบ 403) — ต่างจากอาร์เรย์ว่างที่แปลว่า
 * "ไม่มีคลังในความดูแล" ซึ่งเป็นสถานะปกติที่ควรอธิบายให้ผู้ใช้เข้าใจ ไม่ใช่ error
 */
export function pickPromoStoreCodes(
  scope: PromoScope,
  requested: string | null | undefined
): string[] | null {
  if (scope.kind === "none") return [];
  const want = requested?.trim().toLowerCase();
  if (!want || want === "all") return scope.storeCodes;
  const hit = scope.storeCodes.find((c) => c.toLowerCase() === want);
  return hit ? [hit] : null;
}

/** รายชื่อคลังที่เซลล์คนนี้ดูแล — ลำดับเดียวกับที่ใช้กรองออเดอร์ */
export function ownedVdaCodesForSession(session: SalesSession): string[] {
  const codes = resolveVdaCodesForSalesmanCodes(
    resolveSalesmanCodesForFilter(session)
  );
  if (codes.length > 0) return codes;
  // เซลล์ที่ถือหลายรหัส — ครอบทุก VDA ของคนนั้น เหมือนปุ่ม "ทุก VDA ของฉัน"
  return session.role === "sales" ? resolveAllPersonVdaCodes(session.email) : [];
}
