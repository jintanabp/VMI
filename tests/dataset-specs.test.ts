import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCustomerSpec,
  buildPromotionCreditSpec,
  buildSalesmanSpec,
  buildSkuMasterSpec,
  buildSoldHistorySpec,
  buildStockCoverSpec,
} from "@/lib/fabric/onelake-refresh";

/**
 * ทุกชุดข้อมูลต้องรู้ชื่อไฟล์ต้นทางของตัวเองโดยไม่ต้องมี env
 *
 * เดิมชุดที่ไม่มี *_ONELAKE_PATH ใน .env จะถอยไปสแกนทั้งโฟลเดอร์แล้วเลือกไฟล์ที่คอลัมน์
 * ตรง signature — กลไกนี้เคยหยิบ cft_promotion_credit.csv มาเป็นตาราง C4 แบบเงียบสนิท
 * โหลดผ่านทุกด่าน ไม่มี error และข้อมูลผิดอยู่หลายวัน เทสต์นี้กันไม่ให้มันกลับมา
 */

const MASTERS_WS = "ws-masters";
const MASTERS_LH = "lh-masters";
const STOCK_WS = "ws-stock";
const STOCK_LH = "lh-stock";

function stubBaseEnv() {
  vi.stubEnv("ONELAKE_WORKSPACE_ID", MASTERS_WS);
  vi.stubEnv("ONELAKE_LAKEHOUSE_ID", MASTERS_LH);
  vi.stubEnv("ONELAKE_SCAN_DIR", "Files/exports/");
  vi.stubEnv("STOCK_ONELAKE_WORKSPACE_ID", STOCK_WS);
  vi.stubEnv("STOCK_ONELAKE_LAKEHOUSE_ID", STOCK_LH);
  // .env ของเครื่องที่รันเทสต์อาจตั้งค่าพวกนี้ไว้ — ล้างให้เหลือเคส "ไม่ตั้งอะไรเลย"
  for (const key of [
    "CUSTOMER_ONELAKE_PATH",
    "SALESMAN_ONELAKE_PATH",
    "STOCK_COVER_ONELAKE_PATH",
    "SKU_ONELAKE_PATH",
    "SOLD_HISTORY_ONELAKE_PATH",
    "CFT_ONELAKE_PATH",
    "CFT_WORKSPACE_ID",
    "CFT_LAKEHOUSE_ID",
    "CFT_SCAN_DIR",
    "AI_LH_WORKSPACE_ID",
    "AI_LH_LAKEHOUSE_ID",
    "AI_LH_SCAN_DIR",
  ]) {
    vi.stubEnv(key, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dataset specs", () => {
  it("ปักชื่อไฟล์ต้นทางไว้ทุกชุด ไม่มีชุดไหนถอยไปสแกนโฟลเดอร์", () => {
    stubBaseEnv();

    const specs = [
      [buildCustomerSpec("/tmp/a.csv"), "dim_customer.csv"],
      [buildSalesmanSpec("/tmp/b.csv"), "cross_salesman_reference_email.csv"],
      [buildStockCoverSpec("/tmp/c.csv"), "stock_cover_day.csv"],
      [buildSkuMasterSpec("/tmp/d.csv"), "item_barcode_map_v2.csv"],
      [buildSoldHistorySpec("/tmp/e.csv"), "factsales_odoo.csv"],
      [buildPromotionCreditSpec("/tmp/f.csv"), "cft_promotion_cash.csv"],
    ] as const;

    for (const [spec, fileName] of specs) {
      expect(spec).not.toBeNull();
      expect(spec!.onelakeDir).toBeUndefined();
      expect(spec!.onelakePath).toBe(`Files/exports/${fileName}`);
    }
  });

  it("ยอดขายรายวันชี้ lakehouse ของ stock ไม่ใช่ของ masters", () => {
    stubBaseEnv();

    const spec = buildSoldHistorySpec("/tmp/e.csv");

    // ไฟล์นี้ export ลง lakehouse เดียวกับ stock_cover — ถอยไป masters = 404 เงียบ ๆ
    expect(spec!.workspaceId).toBe(STOCK_WS);
    expect(spec!.onelakeItemId).toBe(STOCK_LH);
    expect(spec!.authProfile).toBe("stock");
  });

  it("ตาราง C4 ชี้ workspace Bronze และใช้ SP ชุด stock โดยไม่ต้องมี env", () => {
    stubBaseEnv();

    const spec = buildPromotionCreditSpec("/tmp/f.csv");

    expect(spec!.workspaceId).not.toBe(MASTERS_WS);
    expect(spec!.authProfile).toBe("stock");
  });
});
