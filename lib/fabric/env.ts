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

/**
 * profile "stock" มี credential ของตัวเองจริงไหม — false = getStockOnelakeAuthEnv()
 * กำลังถอยไปใช้ SP ของ masters อยู่
 *
 * การถอยแบบนี้เงียบสนิทและถูกต้องมาตลอด ตราบใดที่ทุก workspace ที่ profile stock ยิงไป
 * ยอมรับ SP ของ masters ด้วย พอตาราง C4 ย้ายไป Bronze_OrderAgent (ซึ่ง SP ของ masters
 * ไม่มีสิทธิ์) มันจึงกลายเป็น 403 ที่หน้าจอบอกได้แค่ "ตรวจสิทธิ์ SP"
 */
export function stockAuthEnvIsSet(): boolean {
  return Boolean(
    trimEnv("STOCK_ONELAKE_TENANT_ID") ||
      trimEnv("STOCK_ONELAKE_CLIENT_ID") ||
      trimEnv("STOCK_ONELAKE_CLIENT_SECRET")
  );
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

/**
 * โฟลเดอร์ต้นทางบน OneLake — ข้ามค่าว่าง ไม่ใช่แค่ค่าที่ไม่ได้ตั้ง
 *
 * เดิมใช้ `??` ซึ่งมองว่า SCAN_DIR= (ค่าว่างใน .env) คือค่าที่ตั้งไว้แล้ว path ที่ประกอบ
 * ออกมาจึงกลายเป็น "/ชื่อไฟล์.csv" แล้วได้ 404 โดยไม่มีอะไรบอกว่าเพราะบรรทัดว่างบรรทัดเดียว
 */
function scanDirFrom(...keys: string[]): string {
  for (const key of keys) {
    const value = trimEnv(key);
    if (value) return normalizeScanDir(value);
  }
  return "Files/exports/";
}

/** Workspace ร้านค้า + พนักงาน (lakehouse) — คนละ workspace กับ stock */
export function getMastersOnelakeConfig(): MastersOnelakeTarget | null {
  const workspaceId = trimEnv("ONELAKE_WORKSPACE_ID");
  const lakehouseId = trimEnv("ONELAKE_LAKEHOUSE_ID");
  const scanDir = scanDirFrom("ONELAKE_SCAN_DIR");

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
  const scanDir = scanDirFrom("STOCK_ONELAKE_SCAN_DIR", "ONELAKE_SCAN_DIR");

  if (!workspaceId || !exportItemId) {
    return null;
  }

  return {
    workspaceId,
    exportItemId,
    scanDir: normalizeScanDir(scanDir),
  };
}

/**
 * ประวัติยอดขายรายวัน (factsales_odoo) — notebook export ลง lakehouse เดียวกับ stock_cover
 *
 * ถอยไปใช้ config ของ stock ไม่ใช่ของ masters: ไฟล์นี้อยู่ lakehouse ของ stock จริง ๆ
 * การถอยไป masters ทำให้ได้ 404 ทั้งที่ทุกอย่างดูตั้งครบ แล้วต้องมาเติม AI_LH_* ใน .env
 * ทุกเครื่องเพื่อแก้อาการที่ข้อมูลตอบเองได้อยู่แล้ว (AI_LH_* ยัง override ได้ตามเดิม)
 */
export function getSoldHistoryOnelakeConfig(): MastersOnelakeTarget | null {
  const stock = getStockOnelakeConfig();
  const workspaceId =
    trimEnv("AI_LH_WORKSPACE_ID") || stock?.workspaceId || trimEnv("ONELAKE_WORKSPACE_ID");
  const lakehouseId =
    trimEnv("AI_LH_LAKEHOUSE_ID") || stock?.exportItemId || trimEnv("ONELAKE_LAKEHOUSE_ID");
  const scanDir = scanDirFrom("AI_LH_SCAN_DIR", "ONELAKE_SCAN_DIR");

  if (!workspaceId || !lakehouseId) {
    return null;
  }

  return {
    workspaceId,
    lakehouseId,
    scanDir: normalizeScanDir(scanDir),
  };
}

/** ตาราง C4 (cft_promotion_*) — อยู่คนละ workspace กับ masters
 *  ใช้ CFT_* ก่อน ไม่งั้น fallback ไป masters config */
/**
 * ที่อยู่จริงของตาราง C4 cash — Bronze_OrderAgent ซึ่งเป็นคนละ workspace กับ masters
 *
 * ต้องเป็นค่า default ไม่ใช่ปล่อยให้ถอยไป ONELAKE_* ของ masters: lakehouse ของ masters
 * มี cft_promotion_credit.csv (ตารางเก่า 7 บริบท S|99 E|99 ...) วางอยู่ด้วย พอถอยไปที่นั่น
 * แล้ว auto-scan ก็หยิบไฟล์ credit มาเป็นตาราง C4 แบบเงียบ ๆ — ระบบโหลดสำเร็จ ไม่มี error
 * และโปรขึ้นบางตัวเพราะ S|99 มีจริงในไฟล์นั้น จึงไม่มีอะไรฟ้องเลยว่ากำลังใช้ตารางผิดใบ
 * (เกิดจริงบน production 25 ส.ค. 2026 กว่าจะจับได้ก็ไล่กันทั้งวัน)
 *
 * ยัง override ด้วย CFT_WORKSPACE_ID / CFT_LAKEHOUSE_ID ได้ตามเดิมเมื่อย้าย workspace
 */
const C4_CASH_WORKSPACE_ID = "18ff6d42-8639-48a9-acd2-14a0c6b8ac9d";
const C4_CASH_LAKEHOUSE_ID = "92789a85-4269-411f-ad0c-f63ad7733fe2";

export function getPromotionOnelakeConfig(): MastersOnelakeTarget | null {
  const workspaceId = trimEnv("CFT_WORKSPACE_ID") || C4_CASH_WORKSPACE_ID;
  const lakehouseId = trimEnv("CFT_LAKEHOUSE_ID") || C4_CASH_LAKEHOUSE_ID;
  const scanDir = scanDirFrom("CFT_SCAN_DIR", "ONELAKE_SCAN_DIR");

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
