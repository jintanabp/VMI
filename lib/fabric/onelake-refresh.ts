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
  type OnelakeAuthProfile,
} from "./env";
import {
  describeOnelakeIdentity,
  getOnelakeToken,
} from "./onelake-credential";

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
      // (เคสจริง: vda*_product_product ที่ยังมีแค่บาง VDA)
      return fail({
        remotePath,
        skipped: true,
        error:
          `no_remote_file: ไม่พบ ${remotePath} ใน ` +
          `workspace ${spec.workspaceId} / item ${spec.onelakeItemId}`,
      });
    }
    if (err instanceof DownloadError && (err.status === 401 || err.status === 403)) {
      // บอกให้ครบว่า "ใคร" เข้า "ที่ไหน" ไม่ได้ — ข้อความเดิม ("ตรวจสิทธิ์ SP")
      // ไม่ได้บอกว่า SP ตัวไหน ซึ่งเป็นข้อมูลชิ้นเดียวที่ต้องใช้แก้ เพราะ profile
      // ที่ตั้งไว้กับ SP ที่ยิงจริงเป็นคนละตัวได้เมื่อ env ของ profile นั้นไม่ครบ
      const who = describeOnelakeIdentity(spec.authProfile ?? "masters");
      return fail({
        remotePath,
        error:
          `forbidden (${err.status}) — SP ${who.clientId ?? "(ไม่ได้ตั้ง client_id)"} ` +
          `ไม่มีสิทธิ์ workspace ${spec.workspaceId} · ${remotePath} ` +
          `[profile ${who.profile}${
            who.fellBackToMasters
              ? " แต่ STOCK_ONELAKE_* ไม่ได้ตั้ง → ใช้ SP ของ masters แทน"
              : ""
          }${who.mode === "service_principal" ? "" : " — env ไม่ครบ ถอยไปใช้ default credential"}]`,
      });
    }
    return fail({ remotePath, error: errText(err) });
  }
}

function errText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // ข้อความจาก OneLake มี body ทั้งก้อน — ตัดให้พอเห็นสาเหตุแต่ไม่ท่วมไฟล์ status
  return msg.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * ชื่อไฟล์ต้นทางของชุดข้อมูล — env ทับได้ ไม่ตั้ง = ใช้ชื่อมาตรฐานในโค้ด
 *
 * เดิมเมื่อ env ไม่ได้ตั้ง จะคืน onelakeDir ให้ระบบไปสแกนทั้งโฟลเดอร์แล้วเลือกไฟล์ที่
 * "คอลัมน์ตรง signature" ซึ่งเลือกผิดใบได้เงียบ ๆ — cft_promotion_credit.csv ถูกหยิบมา
 * เป็นตาราง C4 ด้วยกลไกนี้ และไม่มีอะไรร้องเลยเพราะไฟล์โหลดผ่านทุกด่าน (25 ส.ค. 2026)
 *
 * ปักชื่อไฟล์ไว้ในโค้ดแทน: ไฟล์ผิดใบจะกลายเป็น 404 ที่เห็นทันทีบนหน้า sync แทนที่จะ
 * เป็นข้อมูลผิดที่ดูปกติ และ .env ก็ไม่ต้องมีบรรทัด *_ONELAKE_PATH ไว้กันเรื่องนี้อีก
 */
function fixedOrDefault(
  envKey: string,
  scanDir: string,
  fileName: string
): { onelakePath: string } {
  const fixed = process.env[envKey]?.trim();
  return {
    onelakePath: fixed || `${scanDir.replace(/\/$/, "")}/${fileName}`,
  };
}

/**
 * profile ของ service principal ที่อ่าน lakehouse ของตาราง C4 (Bronze_OrderAgent)
 *
 * SP ของ masters เข้า workspace นั้นไม่ได้ (403) ทุกชุดข้อมูลที่อยู่ lakehouse เดียวกับ
 * ตาราง C4 จึงต้องใช้ profile เดียวกันหมด — เดิม assorted_mapping ตั้ง default เป็น
 * "masters" ซึ่งถูกอยู่ตอนที่ getPromotionOnelakeConfig ยังถอยไป lakehouse ของ masters
 * เมื่อ .env ไม่มีบล็อก CFT_* พอปักที่อยู่จริงเป็น Bronze (73147a8) มันจึงยิงไป Bronze
 * ด้วย SP ของ masters แล้วได้ 403 ทั้งที่เมื่อวานยังดึงได้ (เกิดจริงบน production 26 ส.ค. 2026)
 *
 * รับหลาย env key ตามลำดับ และข้ามค่าว่าง — `??` เดิมปล่อยให้ CFT_AUTH_PROFILE= (ค่าว่าง)
 * ผ่านไปเป็น profile ว่าง ซึ่งจะกลายเป็น auth ของ masters อีกทางหนึ่ง
 */
function c4AuthProfile(...envKeys: string[]): OnelakeAuthProfile {
  for (const key of envKeys) {
    const value = process.env[key]?.trim();
    if (value) return value as OnelakeAuthProfile;
  }
  return "stock";
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
    ...fixedOrDefault("CUSTOMER_ONELAKE_PATH", cfg.scanDir, "dim_customer.csv"),
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
    ...fixedOrDefault("STOCK_COVER_ONELAKE_PATH", cfg.scanDir, "stock_cover_day.csv"),
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
    ...fixedOrDefault("SALESMAN_ONELAKE_PATH", cfg.scanDir, "cross_salesman_reference_email.csv"),
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
    // ระบุชื่อไฟล์ตรง ๆ ไม่ใช่ auto-scan ทั้งโฟลเดอร์ — cft_promotion_credit.csv มีคอลัมน์
    // ตรง signature เดียวกันทุกตัว การสแกนจึงหยิบตารางเก่ามาแทนได้โดยไม่มีใครรู้
    // ฝั่ง local ฮาร์ดโค้ดชื่อ cft_promotion_cash.csv อยู่แล้ว (paths.ts) ต้นทางก็ควรตรงกัน
    onelakePath:
      process.env.CFT_ONELAKE_PATH?.trim() ||
      `${cfg.scanDir}cft_promotion_cash.csv`,
    columnSignature: ["DIVISIONSALE", "PURCHASEQUANTITYFROM"],
    requiredColumns: [
      "DIVISIONSALE",
      "PRODUCTCODE",
      "CUSTOMERGROUP",
      "PURCHASEQUANTITYFROM",
      "PURCHASEQUANTITYTO",
    ],
    minRows: min.promotion,
    // ตาราง C4 อยู่ workspace Bronze ซึ่ง service principal ของ masters เข้าไม่ถึง
    authProfile: c4AuthProfile("CFT_AUTH_PROFILE"),
  };
}

/** ชื่อกลุ่มโปร — อยู่ lakehouse เดียวกับตาราง C4 จึงใช้ config/profile ชุดเดียวกัน */
export function buildAssortedMappingSpec(localPath: string): RefreshSpec | null {
  const cfg = getPromotionOnelakeConfig();
  if (!cfg) return null;

  return {
    name: "assorted_mapping",
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.lakehouseId,
    scanDir: cfg.scanDir,
    onelakePath:
      process.env.ASSORTED_ONELAKE_PATH?.trim() ||
      `${cfg.scanDir.replace(/\/$/, "")}/cft_assorted_mapping.csv`,
    columnSignature: ["ASSORTEDPRODUCTGROUP", "DESCRIPTIONASSORTED"],
    requiredColumns: ["ASSORTEDPRODUCTGROUP", "DESCRIPTIONASSORTED"],
    minRows: Number(process.env.ASSORTED_MIN_ROWS ?? "50"),
    // lakehouse เดียวกับตาราง C4 → SP ชุดเดียวกัน (default "masters" เดิมได้ 403)
    authProfile: c4AuthProfile("ASSORTED_AUTH_PROFILE", "CFT_AUTH_PROFILE"),
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
    ...fixedOrDefault("SKU_ONELAKE_PATH", cfg.scanDir, "item_barcode_map_v2.csv"),
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
    ...fixedOrDefault("SOLD_HISTORY_ONELAKE_PATH", cfg.scanDir, "factsales_odoo.csv"),
    columnSignature: ["productcode", "date_invoice", "unit_qty"],
    requiredColumns: ["productcode", "date_invoice", "unit_qty"],
    minRows: Number(process.env.SOLD_HISTORY_MIN_ROWS ?? "1"),
    authProfile:
      (process.env.SOLD_HISTORY_AUTH_PROFILE as OnelakeAuthProfile) ?? "stock",
  };
}

/**
 * product.product ต่อ VDA — มูลค่าสต็อกจริง (bi_stock_value)
 *
 * อยู่ lakehouse เดียวกับ stock_cover_day (ตรวจกับ OneLake จริงแล้ว)
 *
 * requiredColumns มีแค่ default_code ตั้งใจ — ตอนนี้มีแต่ vda1 ที่ export
 * bi_stock_value ออกมา ถ้าบังคับคอลัมน์นั้น validation จะตีตกไฟล์ vda อื่นทั้งใบ
 * แล้วหน้าแอดมินจะดูเหมือน sync พังทั้งที่ต้นทางแค่ยังไม่เพิ่มคอลัมน์
 */
export function buildVdaProductSpec(
  vdaKey: string,
  localPath: string
): RefreshSpec | null {
  const cfg = getStockOnelakeConfig();
  if (!cfg) return null;

  const key = vdaKey.trim().toLowerCase();
  const envPath = process.env[`VDA_PRODUCT_ONELAKE_${key.toUpperCase()}`]?.trim();
  const defaultPath = `${cfg.scanDir.replace(/\/$/, "")}/${key}_product_product.csv`;

  return {
    name: `${key}_product_product`,
    localPath,
    workspaceId: cfg.workspaceId,
    onelakeItemId: cfg.exportItemId,
    scanDir: cfg.scanDir,
    onelakePath: envPath || defaultPath,
    columnSignature: ["default_code"],
    requiredColumns: ["default_code"],
    minRows: Number(process.env.VDA_PRODUCT_MIN_ROWS ?? "1"),
    authProfile: "stock",
  };
}

/**
 * เป้าขายเดือนปัจจุบัน (cross_target_current_month) — อยู่ lakehouse เดียวกับตาราง C4
 * จึงใช้ config/auth profile ชุดเดียวกัน
 *
 * requiredColumns เอาแค่ 2 คอลัมน์ที่ใช้จริง — ไฟล์ต้นทางมี 11 คอลัมน์ แต่บังคับครบ
 * แล้ววันหนึ่งเขาเพิ่ม/เปลี่ยนชื่อคอลัมน์ที่เราไม่ได้ใช้ ไฟล์จะถูกตีตกทั้งใบ
 */
/**
 * cross_target_current_month.csv อยู่ lakehouse Bronze_OrderAgent **ที่เดียว**
 * (ตรวจกับ OneLake จริงแล้ว — masters lakehouse ไม่มีไฟล์นี้)
 *
 * จึงไม่ผูกกับ getPromotionOnelakeConfig() ตรง ๆ เพราะมันถอยไป ONELAKE_* เมื่อไม่มี
 * CFT_* ซึ่งเป็นเคสจริงบนเซิร์ฟเวอร์ แล้วได้ 404 โดยไม่มีอะไรบอกว่าไปผิดที่ —
 * ไฟล์อื่นมีอยู่ทั้งสอง lakehouse เลย sync ผ่านหมด ไม่มีใครสังเกต
 *
 * ค่า default ชี้ Bronze ตรง ๆ ให้ทำงานได้โดยไม่ต้องแก้ .env และไม่ไปเปลี่ยนที่มา
 * ของตาราง C4 (การเติม CFT_* จะย้าย promotion_c4 ไปอีก lakehouse ด้วย คนละเรื่องกัน)
 * ย้ายที่เมื่อไหร่ตั้ง CROSS_TARGET_WORKSPACE_ID / CROSS_TARGET_LAKEHOUSE_ID ทับได้
 */
const CROSS_TARGET_WORKSPACE = "18ff6d42-8639-48a9-acd2-14a0c6b8ac9d";
const CROSS_TARGET_LAKEHOUSE = "92789a85-4269-411f-ad0c-f63ad7733fe2";

export function buildCrossTargetSpec(localPath: string): RefreshSpec | null {
  const cfg = getPromotionOnelakeConfig();
  const workspaceId =
    process.env.CROSS_TARGET_WORKSPACE_ID?.trim() ||
    process.env.CFT_WORKSPACE_ID?.trim() ||
    CROSS_TARGET_WORKSPACE;
  const lakehouseId =
    process.env.CROSS_TARGET_LAKEHOUSE_ID?.trim() ||
    process.env.CFT_LAKEHOUSE_ID?.trim() ||
    CROSS_TARGET_LAKEHOUSE;
  const scanDir = cfg?.scanDir ?? "Files/exports/";

  return {
    name: "cross_target_current_month",
    localPath,
    workspaceId,
    onelakeItemId: lakehouseId,
    scanDir,
    onelakePath:
      process.env.CROSS_TARGET_ONELAKE_PATH?.trim() ||
      `${scanDir.replace(/\/$/, "")}/cross_target_current_month.csv`,
    columnSignature: ["SalesManCode", "ProductCode"],
    requiredColumns: ["SalesManCode", "ProductCode"],
    minRows: Number(process.env.CROSS_TARGET_MIN_ROWS ?? "100"),
    // default เป็น stock ไม่ใช่ masters — SP ของ masters ได้ 403 ใน workspace นี้
    authProfile: c4AuthProfile("CROSS_TARGET_AUTH_PROFILE", "CFT_AUTH_PROFILE"),
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
  /** มูลค่าสต็อกต่อ VDA (vda*_product_product) — ขาดได้ หน้าสต็อกถอยไปใช้ราคาขาย */
  vdaProduct: boolean;
  /** เดิมผลของ factsales_odoo ถูกทิ้งเงียบ ๆ ไม่ถึงไฟล์ status เลย */
  soldHistory: boolean;
  /** ชื่อกลุ่มโปร — ล้มได้โดยไม่กระทบโปร (UI ถอยไปแสดงรหัสกลุ่ม) */
  assortedMapping: boolean;
  /** เป้าขายเดือนปัจจุบัน — ขาดได้ แท็บ "ควรมีขาย" จะว่างเฉย ๆ */
  crossTarget: boolean;
  /** ผลละเอียดต่อชุดข้อมูล — ใช้เขียน status รายตารางและแสดงในหน้าแอดมิน */
  datasets: DatasetRefreshResult[];
}

export async function refreshAllMasters(
  options: RefreshOptions = {},
  only?: ReadonlySet<string>
): Promise<RefreshAllResult> {
  const {
    getAssortedMappingCsvPath,
    getCustomerCsvPath,
    getSalesmanCsvPath,
    getStockCoverCsvPath,
    getPromotionCsvPath,
    getSkuMasterCsvPath,
    getSoldHistoryCsvPath,
    getCrossTargetCsvPath,
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
  const assortedMapping = await run(
    buildAssortedMappingSpec(getAssortedMappingCsvPath())
  );
  const skuMaster = await run(buildSkuMasterSpec(getSkuMasterCsvPath()));
  const crossTarget = await run(buildCrossTargetSpec(getCrossTargetCsvPath()));
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

  let vdaProduct = false;
  if (!only || [...only].some((n) => n.endsWith("_product_product"))) {
    const { syncVdaProductValues } = await import("./sync-vda-product-values");
    const vda = await syncVdaProductValues(options, only);
    vdaProduct = vda.any;
    datasets.push(...vda.results);
  }

  return {
    customer,
    salesman,
    stockCover,
    promotion,
    skuMaster,
    vdaProduct,
    soldHistory,
    assortedMapping,
    crossTarget,
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
