import fs from "fs";
import { CustomerDirectory } from "./customer-directory";
import { reloadStockCover } from "./stock-cover";
import {
  getCustomerCsvPath,
  getPromotionCsvPath,
  getSalesmanCsvPath,
  getSkuMasterCsvPath,
} from "./paths";
import { PromotionCredit, reloadPromotionCredit } from "./promotion-credit";
import { SalesmanRegistry } from "./salesman-registry";
import { SkuMasterDirectory, reloadSkuMaster } from "./sku-master";
import { fabricMastersEnabled } from "./env";

let customerDir: CustomerDirectory | null = null;
let salesmanReg: SalesmanRegistry | null = null;
let promoCredit: PromotionCredit | null = null;
let skuMaster: SkuMasterDirectory | null = null;

function shouldLoadSkuMaster() {
  if (!fabricMastersEnabled()) return false;
  const path = getSkuMasterCsvPath();
  return fs.existsSync(path) && fs.statSync(path).size > 100;
}

function shouldLoadMasters() {
  if (!fabricMastersEnabled()) return false;
  const customerPath = getCustomerCsvPath();
  return fs.existsSync(customerPath) && fs.statSync(customerPath).size > 100;
}

function shouldLoadPromotion() {
  if (!fabricMastersEnabled()) return false;
  const path = getPromotionCsvPath();
  return fs.existsSync(path) && fs.statSync(path).size > 100;
}

export function getCustomerDirectory(): CustomerDirectory {
  if (!customerDir) {
    customerDir = new CustomerDirectory();
    if (shouldLoadMasters()) {
      customerDir.load(getCustomerCsvPath());
    }
  }
  return customerDir;
}

export function getSalesmanRegistry(): SalesmanRegistry {
  if (!salesmanReg) {
    salesmanReg = new SalesmanRegistry();
    const path = getSalesmanCsvPath();
    if (fs.existsSync(path) && fs.statSync(path).size > 100) {
      salesmanReg.load(path);
    }
  }
  return salesmanReg;
}

export function getPromotionCreditDirectory(): PromotionCredit {
  if (!promoCredit) {
    promoCredit = new PromotionCredit();
    if (shouldLoadPromotion()) {
      promoCredit.load(getPromotionCsvPath());
    }
  }
  return promoCredit;
}

export function getSkuMasterDirectory(): SkuMasterDirectory {
  if (!skuMaster) {
    skuMaster = new SkuMasterDirectory();
    if (shouldLoadSkuMaster()) {
      skuMaster.load(getSkuMasterCsvPath());
    }
  }
  return skuMaster;
}

export function reloadFabricMasters(): void {
  customerDir = new CustomerDirectory();
  salesmanReg = new SalesmanRegistry();
  promoCredit = new PromotionCredit();
  skuMaster = new SkuMasterDirectory();
  if (shouldLoadMasters()) {
    customerDir.load(getCustomerCsvPath());
  }
  const salesmanPath = getSalesmanCsvPath();
  if (fs.existsSync(salesmanPath)) {
    salesmanReg.load(salesmanPath);
  }
  if (shouldLoadPromotion()) {
    promoCredit.load(getPromotionCsvPath());
  }
  if (shouldLoadSkuMaster()) {
    skuMaster.load(getSkuMasterCsvPath());
  }
  reloadStockCover();
  const { reloadVdaAosBillRegistry } = require("./vda-aos-bill") as typeof import("./vda-aos-bill");
  reloadVdaAosBillRegistry();
}

export function fabricMastersReady(): boolean {
  return shouldLoadMasters() && getCustomerDirectory().isLoaded;
}

export function fabricPromoReady(): boolean {
  return shouldLoadPromotion() && getPromotionCreditDirectory().isLoaded;
}

export function fabricSkuMasterReady(): boolean {
  return shouldLoadSkuMaster() && getSkuMasterDirectory().isLoaded;
}

export * from "./customer-directory";
export * from "./salesman-registry";
export * from "./env";
export * from "./paths";
export * from "./onelake-refresh";
export * from "./stock-cover";
export * from "./stock-filter-config";
export * from "./promotion-credit";
export * from "./promotion-lookup";
export * from "./promotion-context";
export * from "./sku-master";
export * from "./vda-aos-bill";
export * from "./ensure-vda-sales-rep";
