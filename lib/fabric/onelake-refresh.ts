import fs from "fs";
import path from "path";
import { countCsvRows, parseCsv, validateCsvColumns } from "./csv";
import {
  fabricStockEnabled,
  getMastersOnelakeConfig,
  getMinRows,
  getPromotionOnelakeConfig,
  getSoldHistoryOnelakeConfig,
  getStockOnelakeConfig,
  getVdaAosOnelakeConfig,
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

interface PathEntry {
  name: string;
  lastModified?: string;
}

async function listDirectory(
  workspaceId: string,
  itemId: string,
  folder: string,
  token: string
): Promise<PathEntry[]> {
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
    paths?: {
      name: string;
      isDirectory?: boolean;
      contentLength?: string | number;
      lastModified?: string;
    }[];
  };

  return (data.paths ?? [])
    .filter(
      (p) =>
        !p.isDirectory &&
        p.contentLength !== "0" &&
        p.contentLength !== 0 &&
        p.name.includes(".")
    )
    .map((p) => ({
      name: path.basename(p.name),
      lastModified: p.lastModified,
    }));
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
  const candidates: { fpath: string; sortKey: number; name: string }[] = [];

  for (const entry of files) {
    const fpath = `${spec.onelakeDir.replace(/\/$/, "")}/${entry.name}`;
    const url = `${ONELAKE_HOST}/${spec.workspaceId}/${spec.onelakeItemId}/${fpath}`;
    const cols = await readCsvHeader(url, token);
    const colsLower = new Set(cols.map((c) => c.trim().toLowerCase()));
    const match = [...sigLower].every((c) => colsLower.has(c));
    if (!match) continue;

    const sortKey = entry.lastModified
      ? Date.parse(entry.lastModified)
      : 0;
    candidates.push({
      fpath,
      sortKey: Number.isFinite(sortKey) ? sortKey : 0,
      name: entry.name,
    });
  }

  if (candidates.length === 0) {
    console.error(`[${spec.name}] No file matched signature in ${spec.onelakeDir}`);
    return null;
  }

  candidates.sort((a, b) => {
    if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
    return b.name.localeCompare(a.name);
  });

  const chosen = candidates[0]!;
  console.info(
    `[${spec.name}] Matched ${chosen.name} (${candidates.length} candidate(s))`
  );
  return chosen.fpath;
}

/** error ที่พา HTTP status มาด้วย เพื่อแยก "ยังไม่มีไฟล์ต้นทาง" (404) ออกจากปัญหาสิทธิ์ */
class DownloadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

async function downloadFile(url: string, token: string, dest: string): Promise<number> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2020-04-08",
    },
  });

  if (!res.ok) {
    throw new DownloadError(
      `Download failed (${res.status}): ${await res.text()}`,
      res.status
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/**
 * ผลการดึงไฟล์เดียว — เดิม refreshOne คืน boolean เปล่า ทำให้จำนวนแถว/ขนาด/
 * ข้อความ error ที่คำนวณได้อยู่แล้วถูก console.info แล้วทิ้ง หน้าแอดมินจึงบอกได้แค่
 * ✓/✗ ต่อชุดข้อมูล ค่าทุกตัวในนี้มีอยู่แล้วในฟังก์ชัน แค่ไม่เคยถูกส่งออกมา
 */
export interface DatasetRefreshResult {
  name: string;
  ok: boolean;
  /** ไม่มี spec (env ไม่ได้ตั้ง) — ต่างจาก ok:false ที่คือพยายามแล้วล้มเหลว */
  skipped: boolean;
  rows: number | null;
  bytes: number | null;
  mtime: string | null;
  durationMs: number;
  error: string | null;
  remotePath: string | null;
  localPath: string;
  minRows: number;
}

function emptyResult(
  name: string,
  localPath: string,
  minRows: number,
  patch: Partial<DatasetRefreshResult> = {}
): DatasetRefreshResult {
  return {
    name,
    ok: false,
    skipped: false,
    rows: null,
    bytes: null,
    mtime: null,
    durationMs: 0,
    error: null,
    remotePath: null,
    localPath,
    minRows,
    ...patch,
  };
}

export async function refreshOne(
  spec: RefreshSpec | null,
  options: RefreshOptions = {}
): Promise<DatasetRefreshResult> {
  if (!spec) {
    return emptyResult("unknown", "", 0, { skipped: true, error: "not_configured" });
  }

  const startedAt = Date.now();
  const fail = (patch: Partial<DatasetRefreshResult>): DatasetRefreshResult =>
    emptyResult(spec.name, spec.localPath, spec.minRows, {
      durationMs: Date.now() - startedAt,
      ...patch,
    });

  let token: string;
  try {
    token = await getOnelakeToken(
      options.allowInteractive === true,
      spec.authProfile ?? "masters"
    );
  } catch (err) {
    console.error(`[${spec.name}] Token error:`, err);
    return fail({ error: `token: ${errText(err)}` });
  }

  let remotePath = spec.onelakePath;
  if (!remotePath && spec.onelakeDir) {
    remotePath = (await discoverFile(spec, token)) ?? undefined;
  }
  if (!remotePath) return fail({ error: "no_remote_match" });

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
      // validateCsvColumns ปนสองเรื่องใน missing[]: คอลัมน์ที่หาย และ
      // ข้อความ "too_few_rows (…)" เมื่อแถวไม่ถึงขั้นต่ำ — แยกให้หน้าแอดมินอ่านง่าย
      const cols = missing.filter((m) => !m.startsWith("too_few_rows"));
      return fail({
        rows: rowCount,
        bytes: size,
        remotePath,
        error:
          cols.length > 0
            ? `validation: ${cols.join(", ")}`
            : `too_few_rows (got ${rowCount}, need ≥${spec.minRows})`,
        skipped: false,
      });
    }

    fs.renameSync(tmp, spec.localPath);
    console.info(`[${spec.name}] OK — ${rowCount} rows → ${spec.localPath}`);
    return {
      name: spec.name,
      ok: true,
      skipped: false,
      rows: rowCount,
      bytes: size,
      mtime: fs.statSync(spec.localPath).mtime.toISOString(),
      durationMs: Date.now() - startedAt,
      error: null,
      remotePath,
      localPath: spec.localPath,
      minRows: spec.minRows,
    };
  } catch (err) {
    console.error(`[${spec.name}] Refresh failed:`, err);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    if (err instanceof DownloadError && err.status === 404) {
      // ยังไม่ได้ export ตารางนี้ออกมาที่ OneLake — ต่างจาก credential/สิทธิ์พัง
      // (เคสจริง: vda*_aos_bill ที่ยังใช้ VDA_CUSTOMER_MAP/VDA_SALESMAN_MAP แทน)
      return fail({
        remotePath,
        skipped: true,
        error: `no_remote_file: ยังไม่มี ${remotePath} ใน OneLake`,
      });
    }
    if (err instanceof DownloadError && (err.status === 401 || err.status === 403)) {
      return fail({ remotePath, error: `forbidden (${err.status}) — ตรวจสิทธิ์ SP` });
    }
    return fail({ remotePath, error: errText(err) });
  }
}

function errText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // ข้อความจาก OneLake มี body ทั้งก้อน — ตัดให้พอเห็นสาเหตุแต่ไม่ท่วมไฟล์ status
  return msg.replace(/\s+/g, " ").trim().slice(0, 300);
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
  // ตาราง C4 อยู่ workspace Bronze_OrderAgent ซึ่งไม่ใช่ workspace เดียวกับ masters
  // และ SP ของ masters อ่านไม่ได้ (403) — ต้องใช้ profile ของ stock
  const cfg = getPromotionOnelakeConfig();
  if (!cfg) return null;

  const min = getMinRows();
  return {
    name: "promotion_c4",
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
    authProfile:
      (process.env.CFT_AUTH_PROFILE as OnelakeAuthProfile) ?? "masters",
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

export function buildSoldHistorySpec(localPath: string): RefreshSpec | null {
  const cfg = getSoldHistoryOnelakeConfig();
  if (!cfg) return null;

  return {
    name: "factsales_odoo",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.lakehouseId,
    scanDir: cfg.scanDir,
    ...fixedOrAuto("SOLD_HISTORY_ONELAKE_PATH", cfg.scanDir),
    columnSignature: ["productcode", "date_invoice", "unit_qty"],
    requiredColumns: ["productcode", "date_invoice", "unit_qty"],
    minRows: Number(process.env.SOLD_HISTORY_MIN_ROWS ?? "1"),
    authProfile:
      (process.env.SOLD_HISTORY_AUTH_PROFILE as OnelakeAuthProfile) ?? "stock",
  };
}

export function buildVdaAosSpec(
  vdaKey: string,
  localPath: string
): RefreshSpec | null {
  const cfg = getVdaAosOnelakeConfig();
  if (!cfg) return null;

  const key = vdaKey.trim().toLowerCase();
  const envPath = process.env[`VDA_AOS_ONELAKE_${key.toUpperCase()}`]?.trim();
  const defaultPath = `${cfg.scanDir.replace(/\/$/, "")}/${key}_aos_bill.csv`;

  return {
    name: `${key}_aos_bill`,
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.exportItemId,
    scanDir: cfg.scanDir,
    onelakePath: envPath || defaultPath,
    columnSignature: ["salesmancode"],
    requiredColumns: ["salesmancode"],
    minRows: Number(process.env.VDA_AOS_MIN_ROWS ?? "1"),
    authProfile: "stock",
  };
}

export async function bootstrapIfMissing(
  spec: RefreshSpec | null
): Promise<DatasetRefreshResult | null> {
  if (!spec) return null;
  if (fs.existsSync(spec.localPath) && fs.statSync(spec.localPath).size > 100) {
    return null;
  }
  console.info(`[${spec.name}] Local file missing — bootstrap from OneLake`);
  return refreshOne(spec);
}

export interface RefreshAllResult {
  customer: boolean;
  salesman: boolean;
  stockCover: boolean;
  promotion: boolean;
  skuMaster: boolean;
  vdaAos: boolean;
  /** เดิมผลของ factsales_odoo ถูกทิ้งเงียบ ๆ ไม่ถึงไฟล์ status เลย */
  soldHistory: boolean;
  /** ผลละเอียดต่อชุดข้อมูล — ใช้เขียน status รายตารางและแสดงในหน้าแอดมิน */
  datasets: DatasetRefreshResult[];
}

export async function refreshAllMasters(
  options: RefreshOptions = {},
  only?: ReadonlySet<string>
): Promise<RefreshAllResult> {
  const {
    getCustomerCsvPath,
    getSalesmanCsvPath,
    getStockCoverCsvPath,
    getPromotionCsvPath,
    getSkuMasterCsvPath,
    getSoldHistoryCsvPath,
  } = await import("./paths");

  const datasets: DatasetRefreshResult[] = [];
  /** only = undefined คือทำทุกชุด (ปุ่ม "ดึงใหม่ทั้งหมด" และ scheduler) */
  const wanted = (name: string) => !only || only.has(name);

  async function run(spec: RefreshSpec | null): Promise<boolean> {
    if (!spec || !wanted(spec.name)) return false;
    try {
      const res = await refreshOne(spec, options);
      datasets.push(res);
      return res.ok;
    } catch (err) {
      // refreshOne จับ error เองเกือบทุกเส้น — กันเผื่อ token provider โยนแบบ sync
      console.warn(`[${spec.name}] refresh threw:`, err);
      datasets.push(
        emptyResult(spec.name, spec.localPath, spec.minRows, {
          error: errText(err),
        })
      );
      return false;
    }
  }

  const customer = await run(buildCustomerSpec(getCustomerCsvPath()));
  const salesman = await run(buildSalesmanSpec(getSalesmanCsvPath()));
  const promotion = await run(buildPromotionCreditSpec(getPromotionCsvPath()));
  const skuMaster = await run(buildSkuMasterSpec(getSkuMasterCsvPath()));
  // ประวัติยอดขายรายวัน (ไม่บล็อก master อื่น ถ้า config/ไฟล์ไม่พร้อม)
  const soldHistory = await run(buildSoldHistorySpec(getSoldHistoryCsvPath()));

  let stockCover = false;
  if (fabricStockEnabled()) {
    const stockSpec = buildStockCoverSpec(getStockCoverCsvPath());
    if (!stockSpec) {
      console.warn(
        "[stock_cover_day] USE_FABRIC_STOCK enabled but STOCK_ONELAKE_WORKSPACE_ID / ONELAKE_WAREHOUSE_ID not set — skip"
      );
    }
    stockCover = await run(stockSpec);
  }

  let vdaAos = false;
  if (!only || [...only].some((n) => n.endsWith("_aos_bill"))) {
    const { syncVdaAosBills } = await import("./sync-vda-aos-bills");
    const vda = await syncVdaAosBills(options, only);
    vdaAos = vda.any;
    datasets.push(...vda.results);
  }

  return {
    customer,
    salesman,
    stockCover,
    promotion,
    skuMaster,
    vdaAos,
    soldHistory,
    datasets,
  };
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
