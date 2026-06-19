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

export function getPromotionCsvPath() {
  return (
    process.env.PROMOTION_CSV ??
    path.join(getFabricCacheDir(), "cft_promotion_credit.csv")
  );
}

export function getSkuMasterCsvPath() {
  return (
    process.env.SKU_MASTER_CSV ??
    path.join(getFabricCacheDir(), "item_barcode_map_v2.csv")
  );
}

export function getVdaAosCsvPath(vdaKey: string) {
  const key = vdaKey.trim().toLowerCase();
  const fromEnv = process.env[`VDA_AOS_CSV_${key.toUpperCase()}`]?.trim();
  if (fromEnv) return fromEnv;
  return path.join(getFabricCacheDir(), `${key}_aos_bill.csv`);
}
