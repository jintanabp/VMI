/**
 * ตรวจว่า cft_promotion_cash.csv อยู่ที่ไหน อ่านได้ด้วย SP ตัวไหน และ schema ต่างจาก
 * cft_promotion_credit.csv แค่ไหน — อ่านอย่างเดียว ไม่ดาวน์โหลดไฟล์เต็ม
 *
 * Usage: npm run probe:promo-cash
 *
 * ทำไมต้องยิงหลายเป้า: abfss ที่ทีมข้อมูลให้มา (Bronze_OrderAgent) ชี้ไปคนละ
 * workspace กับ ONELAKE_WORKSPACE_ID ที่ masters ใช้อยู่ ถ้าเปลี่ยนแค่ CFT_ONELAKE_PATH
 * จะได้ 404 เงียบ ๆ แล้วระบบใช้ไฟล์ credit เดิมต่อโดยไม่มีใครรู้
 */
import { getOnelakeToken } from "../lib/fabric/onelake-credential";
import { parseCsv } from "../lib/fabric/csv";
import type { OnelakeAuthProfile } from "../lib/fabric/env";

const ONELAKE_HOST = "https://onelake.dfs.fabric.microsoft.com";

/** abfss ที่ระบุมา: .../18ff6d42.../92789a85.../Files/exports/cft_promotion_cash.csv */
const BRONZE = {
  label: "Bronze_OrderAgent (จาก abfss ที่ให้มา)",
  workspaceId: "18ff6d42-8639-48a9-acd2-14a0c6b8ac9d",
  itemId: "92789a85-4269-411f-ad0c-f63ad7733fe2",
};

const MASTERS = {
  label: "masters (ONELAKE_* — ที่ C4 ใช้อยู่ตอนนี้)",
  workspaceId: process.env.ONELAKE_WORKSPACE_ID?.trim() ?? "",
  itemId: process.env.ONELAKE_LAKEHOUSE_ID?.trim() ?? "",
};

const SCAN_DIR = process.env.ONELAKE_SCAN_DIR?.trim() || "Files/exports/";
const CASH_FILE = "cft_promotion_cash.csv";
const CREDIT_FILE = "cft_promotion_credit.csv";

/** คอลัมน์ทั้ง 28 ของ cft_promotion_credit.csv ที่ใช้งานจริงอยู่วันนี้ */
const CREDIT_COLUMNS = [
  "FROMDATE", "TODATE", "DIVISIONSALE", "PRODUCTCODE",
  "PURCHASEQUANTITYFROM", "PURCHASEQUANTITYTO", "PURCHASEUNIT", "TOBREAKUP",
  "COUNTRY", "BANGKOK", "CENTRAL", "NORTHEAST", "NORTH", "SOUTH",
  "CUSTOMERGROUP", "DISCOUNTAMOUNT", "DISCOUNTPERCENT", "SPECIALUNITPRICE",
  "MARKETINGUSER", "PREMIUMPRODUCT", "PREMIUMQUANTITY", "PREMIUMUNIT",
  "ASSORTEDPRODUCTGROUP", "RECORDSTATUS", "USERCODE", "CREATEDATE",
  "UpdateDate", "MINIMUMPURCHASE",
];

/** ประตูที่ทำให้โหลดไม่ขึ้นทั้งชุดถ้าขาด — เทียบตัวพิมพ์เป๊ะ (promotion-credit.ts:5-11) */
const REQUIRED_EXACT = [
  "DIVISIONSALE", "PRODUCTCODE", "CUSTOMERGROUP",
  "PURCHASEQUANTITYFROM", "PURCHASEQUANTITYTO",
];
/** ถ้าไม่มีเลยสักคอลัมน์ = ทุกแถวถูกมองว่าไม่ครอบคลุมภูมิภาคใด → โปรหายหมดแบบเงียบ */
const REGION_COLUMNS = [
  "COUNTRY", "BANGKOK", "CENTRAL", "NORTHEAST", "NORTH", "SOUTH",
];
/** อ่านแบบ optional — ขาดได้แต่ฟีเจอร์บางอย่างจะหาย */
const OPTIONAL_COLUMNS = [
  "POOL_KEY", "ASSORTEDPRODUCTGROUP", "PURCHASEUNIT",
  "DISCOUNTAMOUNT", "DISCOUNTPERCENT",
  "PREMIUMPRODUCT", "PREMIUMQUANTITY", "PREMIUMUNIT",
  "FROMDATE", "TODATE",
];

interface Target {
  label: string;
  workspaceId: string;
  itemId: string;
}

function authHeaders(token: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${token}`,
    "x-ms-version": "2020-04-08",
    ...extra,
  };
}

async function listDir(t: Target, folder: string, token: string) {
  const dirPath = `${t.itemId}/${folder.replace(/\/$/, "")}`;
  const url = `${ONELAKE_HOST}/${t.workspaceId}?resource=filesystem&directory=${encodeURIComponent(dirPath)}&recursive=false`;
  const res = await fetch(url, { headers: authHeaders(token) });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: body.slice(0, 300) };
  }
  const data = JSON.parse(body) as {
    paths?: { name: string; isDirectory?: boolean; contentLength?: string; lastModified?: string }[];
  };
  const entries = (data.paths ?? []).map((p) => ({
    name: p.name.split("/").pop() ?? "",
    isDirectory: Boolean(p.isDirectory),
    size: Number(p.contentLength ?? 0),
    lastModified: p.lastModified ?? "-",
  }));
  return { ok: true as const, status: res.status, entries };
}

/** อ่านแค่ 8KB แรกพอเห็น header + ตัวอย่างแถว (เลียนแบบ readCsvHeader ใน onelake-refresh.ts) */
async function headBytes(t: Target, filePath: string, token: string) {
  const url = `${ONELAKE_HOST}/${t.workspaceId}/${t.itemId}/${filePath}`;
  const res = await fetch(url, {
    headers: authHeaders(token, { Range: "bytes=0-8191" }),
  });
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  const text = (await res.text()).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const { headers } = parseCsv(`${firstLine}\n`);
  return { ok: true as const, status: res.status, headers, lines };
}

async function totalSize(t: Target, filePath: string, token: string) {
  const url = `${ONELAKE_HOST}/${t.workspaceId}/${t.itemId}/${filePath}`;
  const res = await fetch(url, { method: "HEAD", headers: authHeaders(token) });
  return res.ok ? Number(res.headers.get("content-length") ?? 0) : 0;
}

function verdictColumns(headers: string[], sampleLines: string[], bytes: number) {
  const trimmed = headers.map((h) => h.trim());
  const upper = new Set(trimmed.map((h) => h.toUpperCase()));
  const exact = new Set(trimmed);

  const creditUpper = new Set(CREDIT_COLUMNS.map((c) => c.toUpperCase()));
  const missing = CREDIT_COLUMNS.filter((c) => !upper.has(c.toUpperCase()));
  const extra = trimmed.filter((c) => !creditUpper.has(c.toUpperCase()));

  console.log(`\n  [1] เทียบกับ 28 คอลัมน์ของ cft_promotion_credit.csv`);
  console.log(`      พบทั้งหมด ${trimmed.length} คอลัมน์`);
  console.log(`      ขาด  (${missing.length}): ${missing.join(", ") || "— ไม่ขาด"}`);
  console.log(`      เกิน (${extra.length}): ${extra.join(", ") || "— ไม่เกิน"}`);

  console.log(`\n  [2] ตรวจตัวพิมพ์แบบเป๊ะ (ประตู REQUIRED ใน promotion-credit.ts)`);
  let caseTrap = false;
  for (const c of REQUIRED_EXACT) {
    const hasExact = exact.has(c);
    const hasAnyCase = upper.has(c.toUpperCase());
    if (hasExact) {
      console.log(`      OK        ${c}`);
    } else if (hasAnyCase) {
      caseTrap = true;
      const actual = trimmed.find((h) => h.toUpperCase() === c.toUpperCase());
      console.log(`      ⚠ ตัวพิมพ์ ${c}  → ไฟล์ส่งมาเป็น "${actual}"`);
    } else {
      console.log(`      ✗ ขาด     ${c}`);
    }
  }
  if (caseTrap) {
    console.log(
      `      >>> กับดัก: ดาวน์โหลดจะผ่าน (validateCsvColumns lowercase) แต่ load() จะได้ directory ว่าง`
    );
  }

  const regionsFound = REGION_COLUMNS.filter((c) => upper.has(c));
  console.log(`\n  [3] คอลัมน์ภูมิภาค: ${regionsFound.join(", ") || "✗ ไม่พบเลย — promoServesRegion จะ false ทุกแถว"}`);

  const hasGroup = upper.has("ASSORTEDPRODUCTGROUP");
  const hasPool = upper.has("POOL_KEY");
  console.log(
    `  [4] กลุ่มโปร (pooling): ASSORTEDPRODUCTGROUP=${hasGroup ? "มี" : "✗ ไม่มี"} · POOL_KEY=${hasPool ? "มี" : "ไม่มี"}`
  );
  if (!hasGroup && !hasPool) {
    console.log(`      >>> ฟีเจอร์กลุ่มโปรจะตายทั้งหมด — ต้องคุยกับผู้ใช้ก่อนสลับ`);
  }

  const optMissing = OPTIONAL_COLUMNS.filter((c) => !upper.has(c.toUpperCase()));
  console.log(`  [5] optional ที่ขาด: ${optMissing.join(", ") || "— ไม่ขาด"}`);

  // ประมาณจำนวนแถวจากขนาดบรรทัดตัวอย่าง
  const dataLines = sampleLines.slice(1).filter((l) => l.trim().length > 0);
  const avgLen =
    dataLines.length > 0
      ? dataLines.slice(0, 10).reduce((s, l) => s + l.length + 1, 0) /
        Math.min(10, dataLines.length)
      : 0;
  const estRows = avgLen > 0 ? Math.round((bytes - sampleLines[0].length) / avgLen) : 0;
  const minRows = Number(process.env.CFT_MIN_ROWS ?? 1000);
  console.log(
    `  [6] ขนาดไฟล์ ${bytes.toLocaleString()} bytes · ประมาณ ~${estRows.toLocaleString()} แถว · CFT_MIN_ROWS=${minRows}` +
      (estRows > 0 && estRows < minRows ? "  >>> ต่ำกว่าเกณฑ์ ดาวน์โหลดจะถูกปฏิเสธ!" : "")
  );

  console.log(`\n  [7] ตัวอย่างข้อมูล 3 แถวแรก (ดิบ):`);
  for (const l of dataLines.slice(0, 3)) {
    console.log(`      ${l.slice(0, 400)}`);
  }
}

async function probeTarget(t: Target, profile: OnelakeAuthProfile) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`TARGET: ${t.label}`);
  console.log(`  workspace=${t.workspaceId || "(ไม่ได้ตั้ง)"}`);
  console.log(`  item     =${t.itemId || "(ไม่ได้ตั้ง)"}`);
  console.log(`  auth     =${profile}`);
  console.log("=".repeat(78));

  if (!t.workspaceId || !t.itemId) {
    console.log("  ข้าม — ไม่มี id ใน .env");
    return;
  }

  let token: string;
  try {
    token = await getOnelakeToken(false, profile);
  } catch (err) {
    console.log(`  ✗ ขอ token ไม่ได้ (profile=${profile}): ${(err as Error).message}`);
    return;
  }

  const list = await listDir(t, SCAN_DIR, token);
  if (!list.ok) {
    const hint =
      list.status === 403
        ? "SP ยังไม่มีสิทธิ์ workspace นี้ (ขอ Viewer ใน Fabric ก่อน)"
        : list.status === 404
          ? "workspace/item id ไม่ถูก หรือไม่มีโฟลเดอร์นี้"
          : "";
    console.log(`  LIST ${SCAN_DIR} → HTTP ${list.status}  ${hint}`);
    console.log(`  ${list.body}`);
    return;
  }

  console.log(`  LIST ${SCAN_DIR} → HTTP 200, ${list.entries.length} รายการ`);
  const cash = list.entries.find((e) => e.name === CASH_FILE);
  const credit = list.entries.find((e) => e.name === CREDIT_FILE);
  console.log(
    `    ${CASH_FILE}   : ${cash ? `พบ (${cash.size.toLocaleString()} bytes, ${cash.lastModified})` : "✗ ไม่พบ"}`
  );
  console.log(
    `    ${CREDIT_FILE} : ${credit ? `พบ (${credit.size.toLocaleString()} bytes, ${credit.lastModified})` : "ไม่พบ"}`
  );
  const others = list.entries
    .filter((e) => e.name !== CASH_FILE && e.name !== CREDIT_FILE)
    .slice(0, 12);
  if (others.length > 0) {
    console.log(`    ไฟล์อื่นในโฟลเดอร์: ${others.map((e) => e.name).join(", ")}`);
  }

  if (!cash) return;

  const path = `${SCAN_DIR.replace(/\/$/, "")}/${CASH_FILE}`;
  const head = await headBytes(t, path, token);
  if (!head.ok) {
    console.log(`  อ่าน header ไม่ได้ → HTTP ${head.status}: ${head.body}`);
    return;
  }
  const bytes = cash.size || (await totalSize(t, path, token));
  console.log(`\n  HEADER (${head.headers.length} คอลัมน์):`);
  console.log(`  ${head.headers.join(",")}`);
  verdictColumns(head.headers, head.lines, bytes);
}

async function main() {
  console.log("Probe: cft_promotion_cash.csv");
  console.log(`scan dir = ${SCAN_DIR}`);

  const combos: { target: Target; profile: OnelakeAuthProfile }[] = [
    { target: BRONZE, profile: "masters" },
    { target: BRONZE, profile: "stock" },
    { target: MASTERS, profile: "masters" },
  ];

  for (const c of combos) {
    await probeTarget(c.target, c.profile);
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log("อ่านผลยังไง:");
  console.log("  403 = SP ไม่มีสิทธิ์ workspace (ต้องขอสิทธิ์ ไม่ใช่แก้โค้ด)");
  console.log("  404 = workspace/item id ไม่ถูก");
  console.log("  ถ้าเจอไฟล์ใน masters ด้วย → เปลี่ยนแค่ CFT_ONELAKE_PATH พอ");
  console.log("  ถ้าเจอแต่ใน Bronze  → ต้องเพิ่ม CFT_WORKSPACE_ID / CFT_LAKEHOUSE_ID");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
