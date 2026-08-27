import { describe, expect, it } from "vitest";
import { requiredRefreshSucceeded } from "@/lib/fabric/datasets";
import type { DatasetRefreshResult } from "@/lib/fabric/onelake-refresh";

/**
 * รอบ sync สำเร็จไหม — ตัวตัดสินที่ scheduler ใช้เขียน lastSuccessAt / ยิง retry / alert
 *
 * บั๊กที่ปักไว้: เดิมเป็น some(r.ok) → ไฟล์ไม่บังคับ (vda6_product) สำเร็จตัวเดียวก็กลบ
 * การล้มของ customer/sku/stock/promotion ได้ทั้งรอบ ระบบบอกว่าสำเร็จทั้งที่ข้อมูลเก่า
 * ไม่มี retry ไม่มี alert หน้า sync เขียว (ตรงกับเคสโปรหายเดือน ส.ค.)
 */

function result(
  name: string,
  ok: boolean,
  extra: Partial<DatasetRefreshResult> = {}
): DatasetRefreshResult {
  return {
    name,
    ok,
    skipped: false,
    rows: ok ? 100 : null,
    bytes: ok ? 1000 : null,
    mtime: null,
    durationMs: 1,
    error: ok ? null : "ล้ม",
    remotePath: null,
    localPath: `/tmp/${name}.csv`,
    minRows: 0,
    ...extra,
  };
}

describe("requiredRefreshSucceeded", () => {
  it("required ล้ม + optional สำเร็จ = ไม่ผ่าน (บั๊กเดิม some ทำให้ผ่าน)", () => {
    const results = [
      result("customer_master", false),
      result("sku_master", false),
      result("stock_cover_day", false),
      result("promotion_c4", false),
      result("vda6_product_product", true), // optional ตัวเดียวสำเร็จ
    ];
    expect(requiredRefreshSucceeded(results)).toBe(false);
  });

  it("required ครบทุกตัวผ่าน = ผ่าน แม้ optional บางตัวล้ม", () => {
    const results = [
      result("customer_master", true),
      result("salesman_registry", true),
      result("stock_cover_day", true),
      result("promotion_c4", true),
      result("sku_master", true),
      result("cross_target_current_month", false), // optional ล้มได้
      result("vda6_product_product", false),
    ];
    expect(requiredRefreshSucceeded(results)).toBe(true);
  });

  it("required ตัวเดียวล้มในบรรดา required ที่ผ่าน = ไม่ผ่าน", () => {
    const results = [
      result("customer_master", true),
      result("sku_master", true),
      result("stock_cover_day", true),
      result("promotion_c4", false), // โปรล้ม = ทั้งรอบล้ม
      result("salesman_registry", true),
    ];
    expect(requiredRefreshSucceeded(results)).toBe(false);
  });

  it("รอบที่มีแต่ optional (admin กดดึง vda6 อย่างเดียว) = ใช้ some เดิม", () => {
    // ไม่มี required ให้ตัดสิน — ดึง vda6 สำเร็จต้องไม่ถูกรายงานว่าล้ม
    expect(requiredRefreshSucceeded([result("vda6_product_product", true)])).toBe(true);
    expect(requiredRefreshSucceeded([result("vda6_product_product", false)])).toBe(false);
  });

  it("required ที่ skipped (ไม่ตั้ง env) นับเป็นล้ม — required แต่ไม่มา = config พัง", () => {
    const results = [
      result("customer_master", false, { skipped: true, error: null }),
      result("sku_master", true),
      result("stock_cover_day", true),
      result("promotion_c4", true),
    ];
    expect(requiredRefreshSucceeded(results)).toBe(false);
  });
});
