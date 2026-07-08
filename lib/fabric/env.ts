function trimEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

/** Auth env — ONELAKE_* first, then AZURE_* (same as ocr-po-matching). */
export function getOnelakeAuthEnv() {
  return {
    tenantId:
      trimEnv("ONELAKE_TENANT_ID") ||
      trimEnv("AZURE_TENANT_ID") ||
      trimEnv("NEXT_PUBLIC_AZURE_AD_TENANT_ID"),
    clientId:
      trimEnv("ONELAKE_CLIENT_ID") ||
      trimEnv("AZURE_CLIENT_ID") ||
      trimEnv("NEXT_PUBLIC_AZURE_AD_CLIENT_ID"),
    clientSecret:
      trimEnv("ONELAKE_CLIENT_SECRET") || trimEnv("AZURE_CLIENT_SECRET"),
  };
}

/** Auth แยกสำหรับ workspace stock (fallback → masters auth). */
export function getStockOnelakeAuthEnv() {
  const stockTenant = trimEnv("STOCK_ONELAKE_TENANT_ID");
  const stockClient = trimEnv("STOCK_ONELAKE_CLIENT_ID");
  const stockSecret = trimEnv("STOCK_ONELAKE_CLIENT_SECRET");

  if (stockTenant || stockClient || stockSecret) {
    return {
      tenantId: stockTenant || trimEnv("NEXT_PUBLIC_AZURE_AD_TENANT_ID"),
      clientId: stockClient,
      clientSecret: stockSecret,
    };
  }

  return getOnelakeAuthEnv();
}

export type OnelakeAuthProfile = "masters" | "stock";

export function getOnelakeAuthEnvForProfile(profile: OnelakeAuthProfile = "masters") {
  return profile === "stock" ? getStockOnelakeAuthEnv() : getOnelakeAuthEnv();
}

export interface MastersOnelakeTarget {
  workspaceId: string;
  lakehouseId: string;
  scanDir: string;
}

export interface StockOnelakeTarget {
  workspaceId: string;
  /** Lakehouse id สำหรับดึง CSV (Files/exports/) */
  exportItemId: string;
  scanDir: string;
}

function normalizeScanDir(dir: string) {
  return dir.endsWith("/") ? dir : `${dir}/`;
}

/** Workspace ร้านค้า + พนักงาน (lakehouse) — คนละ workspace กับ stock */
export function getMastersOnelakeConfig(): MastersOnelakeTarget | null {
  const workspaceId = trimEnv("ONELAKE_WORKSPACE_ID");
  const lakehouseId = trimEnv("ONELAKE_LAKEHOUSE_ID");
  const scanDir = process.env.ONELAKE_SCAN_DIR ?? "Files/exports/";

  if (!workspaceId || !lakehouseId) {
    return null;
  }

  return {
    workspaceId,
    lakehouseId,
    scanDir: normalizeScanDir(scanDir),
  };
}

/** Workspace stock — CSV export อยู่ใน Lakehouse (ไม่ใช่ Mirrored Warehouse) */
export function getStockOnelakeConfig(): StockOnelakeTarget | null {
  const workspaceId =
    trimEnv("STOCK_ONELAKE_WORKSPACE_ID") || trimEnv("ONELAKE_STOCK_WORKSPACE_ID");
  // Mirrored warehouse ไม่มี Files/ — export CSV ต้องไป Lakehouse
  const exportItemId =
    trimEnv("STOCK_ONELAKE_LAKEHOUSE_ID") ||
    trimEnv("STOCK_COVER_LAKEHOUSE_ID") ||
    trimEnv("ONELAKE_WAREHOUSE_ID") ||
    trimEnv("STOCK_ONELAKE_WAREHOUSE_ID");
  const scanDir =
    process.env.STOCK_ONELAKE_SCAN_DIR ??
    process.env.ONELAKE_SCAN_DIR ??
    "Files/exports/";

  if (!workspaceId || !exportItemId) {
    return null;
  }

  return {
    workspaceId,
    exportItemId,
    scanDir: normalizeScanDir(scanDir),
  };
}

/** Ai_LH lakehouse — ประวัติยอดขายรายวัน (cross_sold_history_2y_qu)
 *  ใช้ค่าเฉพาะ AI_LH_* ก่อน ไม่งั้น fallback ไป masters config */
export function getSoldHistoryOnelakeConfig(): MastersOnelakeTarget | null {
  const workspaceId =
    trimEnv("AI_LH_WORKSPACE_ID") || trimEnv("ONELAKE_WORKSPACE_ID");
  const lakehouseId =
    trimEnv("AI_LH_LAKEHOUSE_ID") || trimEnv("ONELAKE_LAKEHOUSE_ID");
  const scanDir =
    process.env.AI_LH_SCAN_DIR ??
    process.env.ONELAKE_SCAN_DIR ??
    "Files/exports/";

  if (!workspaceId || !lakehouseId) {
    return null;
  }

  return {
    workspaceId,
    lakehouseId,
    scanDir: normalizeScanDir(scanDir),
  };
}

/** @deprecated use getMastersOnelakeConfig — kept for callers expecting auth+master */
export function getOnelakeConfig() {
  const masters = getMastersOnelakeConfig();
  if (!masters) return null;

  return {
    ...getOnelakeAuthEnv(),
    workspaceId: masters.workspaceId,
    lakehouseId: masters.lakehouseId,
    scanDir: masters.scanDir,
  };
}

export function hasMastersOnelakeTargets(): boolean {
  return getMastersOnelakeConfig() !== null;
}

export function hasStockOnelakeTargets(): boolean {
  return getStockOnelakeConfig() !== null;
}

/** มี workspace อย่างน้อยหนึ่งชุดสำหรับ sync */
export function hasAnyOnelakeTargets(): boolean {
  if (hasMastersOnelakeTargets()) return true;
  if (fabricStockEnabled() && hasStockOnelakeTargets()) return true;
  return false;
}

export function getMinRows() {
  return {
    customer: Number(process.env.CUSTOMER_MIN_ROWS ?? "20000"),
    salesman: Number(process.env.SALESMAN_MIN_ROWS ?? "1000"),
    stockCover: Number(process.env.STOCK_COVER_MIN_ROWS ?? "100"),
    promotion: Number(process.env.CFT_MIN_ROWS ?? "1000"),
    skuMaster: Number(process.env.SKU_MIN_ROWS ?? "50000"),
  };
}

/** @deprecated use getStockOnelakeConfig().exportItemId */
export function getStockOnelakeItemId() {
  return getStockOnelakeConfig()?.exportItemId ?? "";
}

/** Workspace สำหรับ vda{N}_aos_bill (salesmancode ต่อ VDA) */
export function getVdaAosOnelakeConfig(): StockOnelakeTarget | null {
  const workspaceId =
    trimEnv("VDA_AOS_WORKSPACE_ID") || trimEnv("STOCK_ONELAKE_WORKSPACE_ID");
  const exportItemId =
    trimEnv("VDA_AOS_LAKEHOUSE_ID") ||
    trimEnv("VDA_BILL_LAKEHOUSE_ID");
  const scanDir =
    process.env.VDA_AOS_SCAN_DIR ??
    process.env.STOCK_ONELAKE_SCAN_DIR ??
    "Files/exports/";

  if (!workspaceId || !exportItemId) {
    return null;
  }

  return {
    workspaceId,
    exportItemId,
    scanDir: normalizeScanDir(scanDir),
  };
}

/** True when stock_cover_day CSV should drive store stock (synced to SQLite). */
export function fabricStockEnabled() {
  if (process.env.USE_FABRIC_STOCK === "false") return false;
  if (process.env.USE_FABRIC_STOCK === "true") return true;
  return process.env.DATA_SOURCE === "fabric";
}

/** True when Fabric master CSVs should drive store/salesman lookups. */
export function fabricMastersEnabled() {
  if (process.env.USE_FABRIC_MASTERS === "false") return false;
  if (process.env.USE_FABRIC_MASTERS === "true") return true;
  return process.env.DATA_SOURCE === "fabric";
}
