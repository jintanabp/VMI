import path from "path";

export function getFabricCacheDir() {
  return process.env.FABRIC_CACHE_DIR ?? path.join(process.cwd(), "data", "cache");
}

export function getCustomerCsvPath() {
  return (
    process.env.CUSTOMER_MASTER_CSV ??
    path.join(getFabricCacheDir(), "dim_customer.csv")
  );
}

export function getSalesmanCsvPath() {
  return (
    process.env.SALESMAN_CSV ??
    path.join(getFabricCacheDir(), "cross_salesman_reference_email.csv")
  );
}

export function getStockCoverCsvPath() {
  return (
    process.env.STOCK_COVER_CSV ??
    path.join(getFabricCacheDir(), "stock_cover_day.csv")
  );
}

/** ตาราง C4 — ตั้ง PROMOTION_CSV เพื่อชี้กลับไฟล์เดิมได้ทันทีถ้าต้อง rollback */
export function getPromotionCsvPath() {
  return (
    process.env.PROMOTION_CSV ??
    path.join(getFabricCacheDir(), "cft_promotion_cash.csv")
  );
}

/** เป้าขายเดือนปัจจุบันต่อพนักงานขาย — อยู่ lakehouse เดียวกับ C4 */
export function getCrossTargetCsvPath() {
  return (
    process.env.CROSS_TARGET_CSV ??
    path.join(getFabricCacheDir(), "cross_target_current_month.csv")
  );
}

/** ชื่อกลุ่มโปร (ASSORTEDPRODUCTGROUP → DESCRIPTIONASSORTED) — อยู่ lakehouse เดียวกับ C4 */
export function getAssortedMappingCsvPath() {
  return (
    process.env.ASSORTED_MAPPING_CSV ??
    path.join(getFabricCacheDir(), "cft_assorted_mapping.csv")
  );
}

export function getSkuMasterCsvPath() {
  return (
    process.env.SKU_MASTER_CSV ??
    path.join(getFabricCacheDir(), "item_barcode_map_v2.csv")
  );
}

export function getSoldHistoryCsvPath() {
  return (
    process.env.SOLD_HISTORY_CSV ??
    path.join(getFabricCacheDir(), "factsales_odoo.csv")
  );
}


/** product.product ต่อ VDA — มูลค่าสต็อกจริง (bi_stock_value) ที่ร้านซื้อไป */
export function getVdaProductCsvPath(vdaKey: string) {
  const key = vdaKey.trim().toLowerCase();
  const fromEnv = process.env[`VDA_PRODUCT_CSV_${key.toUpperCase()}`]?.trim();
  if (fromEnv) return fromEnv;
  return path.join(getFabricCacheDir(), `${key}_product_product.csv`);
}
