/**
 * Sync dim_customer + cross_salesman_reference_email from Fabric OneLake.
 * Ported from ocr-po-matching/backend/master_refresh.py
 *
 * Usage: npm run sync:masters
 */import {
  bootstrapIfMissing,
  buildCustomerSpec,
  buildSalesmanSpec,
  localFileStats,
  refreshAllMasters,
  reloadFabricMasters,
} from "../lib/fabric";
import { getCustomerCsvPath, getSalesmanCsvPath } from "../lib/fabric/paths";

async function main() {
  const customerPath = getCustomerCsvPath();
  const salesmanPath = getSalesmanCsvPath();

  console.log("VMI Fabric master sync");
  console.log("  customer →", customerPath);
  console.log("  salesman →", salesmanPath);

  await bootstrapIfMissing(buildCustomerSpec(customerPath));
  await bootstrapIfMissing(buildSalesmanSpec(salesmanPath));

  const { buildStockCoverSpec, buildPromotionCreditSpec, buildSkuMasterSpec } = await import("../lib/fabric/onelake-refresh");
  const { fabricStockEnabled } = await import("../lib/fabric/env");
  const { getStockCoverCsvPath, getPromotionCsvPath, getSkuMasterCsvPath } = await import("../lib/fabric/paths");

  if (fabricStockEnabled()) {
    const stockPath = getStockCoverCsvPath();
    console.log("  stock_cover →", stockPath);
    await bootstrapIfMissing(buildStockCoverSpec(stockPath));
  }

  const promoPath = getPromotionCsvPath();
  const skuPath = getSkuMasterCsvPath();
  console.log("  promotion →", promoPath);
  console.log("  sku_master →", skuPath);
  await bootstrapIfMissing(buildPromotionCreditSpec(promoPath));
  await bootstrapIfMissing(buildSkuMasterSpec(skuPath));

  const result = await refreshAllMasters();
  console.log("Refresh result:", result);

  const cust = localFileStats(customerPath);
  const sales = localFileStats(salesmanPath);
  const stock = fabricStockEnabled() ? localFileStats(getStockCoverCsvPath()) : null;
  const promo = localFileStats(getPromotionCsvPath());
  const sku = localFileStats(getSkuMasterCsvPath());
  console.log("Customer file:", cust);
  console.log("Salesman file:", sales);
  if (stock) console.log("Stock cover file:", stock);
  console.log("Promotion file:", promo);
  console.log("SKU master file:", sku);

  reloadFabricMasters();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
