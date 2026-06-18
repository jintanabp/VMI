import fs from "fs";
import path from "path";
import { countCsvRows, parseCsv, validateCsvColumns } from "./csv";
import {
  fabricStockEnabled,
  getMastersOnelakeConfig,
  getMinRows,
  getStockOnelakeConfig,
  type OnelakeAuthProfile,
} from "./env";
import { getOnelakeToken } from "./onelake-credential";

const ONELAKE_HOST = "https://onelake.dfs.fabric.microsoft.com";

export interface RefreshOptions {
  /** Admin manual refresh — falls back to browser login like ocr-po-matching */
  allowInteractive?: boolean;
}

export interface RefreshSpec {
  name: string;
  localPath: string;
  workspaceId: string;
  onelakeItemId: string;
  scanDir: string;
  onelakePath?: string;
  onelakeDir?: string;
  columnSignature: string[];
  requiredColumns: string[];
  minRows: number;
  authProfile?: OnelakeAuthProfile;
}

async function listDirectory(
  workspaceId: string,
  itemId: string,
  folder: string,
  token: string
): Promise<string[]> {
  const dirPath = `${itemId}/${folder.replace(/\/$/, "")}`;
  const url = `${ONELAKE_HOST}/${workspaceId}?resource=filesystem&directory=${encodeURIComponent(dirPath)}&recursive=false`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2020-04-08",
    },
  });

  if (!res.ok) {
    throw new Error(`Cannot list directory (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    paths?: { name: string; isDirectory?: boolean; contentLength?: string | number }[];
  };

  return (data.paths ?? [])
    .filter(
      (p) =>
        !p.isDirectory &&
        p.contentLength !== "0" &&
        p.contentLength !== 0 &&
        p.name.includes(".")
    )
    .map((p) => path.basename(p.name));
}

async function readCsvHeader(url: string, token: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2020-04-08",
      Range: "bytes=0-4095",
    },
  });

  if (!res.ok) return [];
  const chunk = (await res.text()).replace(/^\uFEFF/, "");
  const firstLine = chunk.split("\n")[0]?.trim() ?? "";
  const { headers } = parseCsv(`${firstLine}\n`);
  return headers;
}

async function discoverFile(spec: RefreshSpec, token: string): Promise<string | null> {
  if (!spec.onelakeDir) return null;

  const files = await listDirectory(
    spec.workspaceId,
    spec.onelakeItemId,
    spec.onelakeDir,
    token
  );
  const sigLower = new Set(spec.columnSignature.map((c) => c.toLowerCase()));

  for (const fname of files) {
    const fpath = `${spec.onelakeDir.replace(/\/$/, "")}/${fname}`;
    const url = `${ONELAKE_HOST}/${spec.workspaceId}/${spec.onelakeItemId}/${fpath}`;
    const cols = await readCsvHeader(url, token);
    const colsLower = new Set(cols.map((c) => c.trim().toLowerCase()));
    const match = [...sigLower].every((c) => colsLower.has(c));
    if (match) {
      console.info(`[${spec.name}] Matched ${fname}`);
      return fpath;
    }
  }

  console.error(`[${spec.name}] No file matched signature in ${spec.onelakeDir}`);
  return null;
}

async function downloadFile(url: string, token: string, dest: string): Promise<number> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2020-04-08",
    },
  });

  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${await res.text()}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

export async function refreshOne(
  spec: RefreshSpec | null,
  options: RefreshOptions = {}
): Promise<boolean> {
  if (!spec) {
    return false;
  }

  let token: string;
  try {
    token = await getOnelakeToken(
      options.allowInteractive === true,
      spec.authProfile ?? "masters"
    );
  } catch (err) {
    console.error(`[${spec.name}] Token error:`, err);
    return false;
  }

  let remotePath = spec.onelakePath;
  if (!remotePath && spec.onelakeDir) {
    remotePath = (await discoverFile(spec, token)) ?? undefined;
  }
  if (!remotePath) return false;

  const url = `${ONELAKE_HOST}/${spec.workspaceId}/${spec.onelakeItemId}/${remotePath}`;
  const tmp = `${spec.localPath}.tmp`;

  fs.mkdirSync(path.dirname(spec.localPath), { recursive: true });

  try {
    const size = await downloadFile(url, token, tmp);
    console.info(`[${spec.name}] Downloaded ${size} bytes from ${remotePath}`);

    const { rowCount, missing } = validateCsvColumns(
      tmp,
      spec.requiredColumns,
      spec.minRows
    );
    if (missing.length > 0) {
      console.error(`[${spec.name}] Validation failed: ${missing.join(", ")}`);
      fs.unlinkSync(tmp);
      return false;
    }

    fs.renameSync(tmp, spec.localPath);
    console.info(`[${spec.name}] OK — ${rowCount} rows → ${spec.localPath}`);
    return true;
  } catch (err) {
    console.error(`[${spec.name}] Refresh failed:`, err);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    return false;
  }
}

function fixedOrAuto(envKey: string, scanDir: string): { onelakePath?: string; onelakeDir?: string } {
  const fixed = process.env[envKey]?.trim();
  if (fixed) return { onelakePath: fixed };
  return { onelakeDir: scanDir };
}

export function buildCustomerSpec(localPath: string): RefreshSpec | null {
  const cfg = getMastersOnelakeConfig();
  if (!cfg) return null;

  const min = getMinRows();
  return {
    name: "customer_master",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.lakehouseId,
    scanDir: cfg.scanDir,
    ...fixedOrAuto("CUSTOMER_ONELAKE_PATH", cfg.scanDir),
    columnSignature: ["CustomerCode", "AddressName"],
    requiredColumns: ["CustomerCode", "AddressName"],
    minRows: min.customer,
  };
}

export function buildStockCoverSpec(localPath: string): RefreshSpec | null {
  const cfg = getStockOnelakeConfig();
  if (!cfg) return null;

  const min = getMinRows();
  return {
    name: "stock_cover_day",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.exportItemId,
    scanDir: cfg.scanDir,
    ...fixedOrAuto("STOCK_COVER_ONELAKE_PATH", cfg.scanDir),
    columnSignature: ["productcode", "from_db", "qty_available"],
    requiredColumns: [
      "productcode",
      "product_name",
      "from_db",
      "qty_available",
      "avg_qty_out_L7",
      "cover_day_L7",
    ],
    minRows: min.stockCover,
    authProfile: "stock",
  };
}

export function buildSalesmanSpec(localPath: string): RefreshSpec | null {
  const cfg = getMastersOnelakeConfig();
  if (!cfg) return null;

  const min = getMinRows();
  return {
    name: "salesman_registry",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.lakehouseId,
    scanDir: cfg.scanDir,
    ...fixedOrAuto("SALESMAN_ONELAKE_PATH", cfg.scanDir),
    columnSignature: ["email", "sYear"],
    requiredColumns: ["Code", "email", "sYear", "sMonth", "EmployeeNo"],
    minRows: min.salesman,
  };
}

export function buildPromotionCreditSpec(localPath: string): RefreshSpec | null {
  const cfg = getMastersOnelakeConfig();
  if (!cfg) return null;

  const min = getMinRows();
  return {
    name: "promotion_credit",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.lakehouseId,
    scanDir: cfg.scanDir,
    ...fixedOrAuto("CFT_ONELAKE_PATH", cfg.scanDir),
    columnSignature: ["DIVISIONSALE", "PURCHASEQUANTITYFROM"],
    requiredColumns: [
      "DIVISIONSALE",
      "PRODUCTCODE",
      "CUSTOMERGROUP",
      "PURCHASEQUANTITYFROM",
      "PURCHASEQUANTITYTO",
    ],
    minRows: min.promotion,
  };
}

export function buildSkuMasterSpec(localPath: string): RefreshSpec | null {
  const cfg = getMastersOnelakeConfig();
  if (!cfg) return null;

  const min = getMinRows();
  return {
    name: "sku_master",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.lakehouseId,
    scanDir: cfg.scanDir,
    ...fixedOrAuto("SKU_ONELAKE_PATH", cfg.scanDir),
    columnSignature: ["BARCODE", "PRODUCTCODE"],
    requiredColumns: ["BARCODE", "PRODUCTCODE"],
    minRows: min.skuMaster,
  };
}

export function bootstrapIfMissing(spec: RefreshSpec | null): Promise<boolean> {
  if (!spec) return Promise.resolve(false);
  if (fs.existsSync(spec.localPath) && fs.statSync(spec.localPath).size > 100) {
    return Promise.resolve(false);
  }
  console.info(`[${spec.name}] Local file missing — bootstrap from OneLake`);
  return refreshOne(spec);
}

export async function refreshAllMasters(
  options: RefreshOptions = {}
): Promise<{
  customer: boolean;
  salesman: boolean;
  stockCover: boolean;
  promotion: boolean;
  skuMaster: boolean;
}> {
  const {
    getCustomerCsvPath,
    getSalesmanCsvPath,
    getStockCoverCsvPath,
    getPromotionCsvPath,
    getSkuMasterCsvPath,
  } = await import("./paths");

  let customer = false;
  let salesman = false;
  let promotion = false;
  let skuMaster = false;
  const customerSpec = buildCustomerSpec(getCustomerCsvPath());
  const salesmanSpec = buildSalesmanSpec(getSalesmanCsvPath());
  const promotionSpec = buildPromotionCreditSpec(getPromotionCsvPath());
  const skuSpec = buildSkuMasterSpec(getSkuMasterCsvPath());
  if (customerSpec) {
    customer = await refreshOne(customerSpec, options);
  }
  if (salesmanSpec) {
    salesman = await refreshOne(salesmanSpec, options);
  }
  if (promotionSpec) {
    promotion = await refreshOne(promotionSpec, options);
  }
  if (skuSpec) {
    skuMaster = await refreshOne(skuSpec, options);
  }

  let stockCover = false;
  if (fabricStockEnabled()) {
    const stockSpec = buildStockCoverSpec(getStockCoverCsvPath());
    if (stockSpec) {
      stockCover = await refreshOne(stockSpec, options);
    } else {
      console.warn(
        "[stock_cover_day] USE_FABRIC_STOCK enabled but STOCK_ONELAKE_WORKSPACE_ID / ONELAKE_WAREHOUSE_ID not set — skip"
      );
    }
  }

  return { customer, salesman, stockCover, promotion, skuMaster };
}

export function localFileStats(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    bytes: stat.size,
    rows: countCsvRows(filePath),
    mtime: stat.mtime.toISOString(),
  };
}
