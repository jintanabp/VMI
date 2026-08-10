/**
 * สำรวจ cross_target_current_month.csv บน OneLake — อ่านอย่างเดียว ไม่ดาวน์โหลดไฟล์เต็ม
 *
 * Usage: npm run probe:cross-target
 *
 * ไฟล์อยู่ workspace/lakehouse เดียวกับตาราง C4 (CFT_*) ซึ่งตั้งไว้ใน .env อยู่แล้ว
 * ต้องรู้ชื่อคอลัมน์จริงก่อนถึงจะเขียน spec/loader ได้ — เดาชื่อคอลัมน์แล้ว
 * requiredColumns ไม่ตรงจะทำให้ไฟล์ถูกตีตกทั้งใบโดยไม่มีใครเห็นสาเหตุ
 */
import { getOnelakeToken } from "../lib/fabric/onelake-credential";
import { parseCsv } from "../lib/fabric/csv";
import type { OnelakeAuthProfile } from "../lib/fabric/env";

const ONELAKE_HOST = "https://onelake.dfs.fabric.microsoft.com";

const TARGET = {
  label: "Bronze_OrderAgent (CFT_* — ที่เดียวกับตาราง C4)",
  workspaceId:
    process.env.CFT_WORKSPACE_ID?.trim() ||
    "18ff6d42-8639-48a9-acd2-14a0c6b8ac9d",
  itemId:
    process.env.CFT_LAKEHOUSE_ID?.trim() ||
    "92789a85-4269-411f-ad0c-f63ad7733fe2",
};

const SCAN_DIR = process.env.CFT_SCAN_DIR?.trim() || "Files/exports/";
const FILE = process.argv[2]?.trim() || "cross_target_current_month.csv";

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, "x-ms-version": "2020-04-08", ...extra };
}

async function listDir(token: string) {
  const dirPath = `${TARGET.itemId}/${SCAN_DIR.replace(/\/$/, "")}`;
  const url = `${ONELAKE_HOST}/${TARGET.workspaceId}?resource=filesystem&directory=${encodeURIComponent(dirPath)}&recursive=false`;
  const res = await fetch(url, { headers: authHeaders(token) });
  const body = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: body.slice(0, 300) };
  const data = JSON.parse(body) as {
    paths?: { name: string; contentLength?: string; lastModified?: string }[];
  };
  return {
    ok: true as const,
    entries: (data.paths ?? []).map((p) => ({
      name: p.name.split("/").pop() ?? "",
      size: Number(p.contentLength ?? 0),
      lastModified: p.lastModified ?? "-",
    })),
  };
}

/** อ่านแค่ 32KB แรก พอเห็น header + ตัวอย่างแถวหลายสิบแถว */
async function headBytes(filePath: string, token: string) {
  const url = `${ONELAKE_HOST}/${TARGET.workspaceId}/${TARGET.itemId}/${filePath}`;
  const res = await fetch(url, {
    headers: authHeaders(token, { Range: "bytes=0-32767" }),
  });
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  const text = (await res.text()).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  const { headers } = parseCsv(`${lines[0] ?? ""}\n`);
  return { ok: true as const, headers, lines };
}

async function probe(profile: OnelakeAuthProfile) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`${TARGET.label}  ·  auth=${profile}`);
  console.log(`  workspace=${TARGET.workspaceId}`);
  console.log(`  lakehouse=${TARGET.itemId}`);
  console.log("=".repeat(78));

  let token: string;
  try {
    token = await getOnelakeToken(false, profile);
  } catch (err) {
    console.log(`  ✗ ขอ token ไม่ได้: ${(err as Error).message}`);
    return false;
  }

  const list = await listDir(token);
  if (!list.ok) {
    const hint =
      list.status === 403
        ? "SP ไม่มีสิทธิ์ workspace นี้"
        : list.status === 404
          ? "workspace/lakehouse id ไม่ถูก"
          : "";
    console.log(`  LIST ${SCAN_DIR} → HTTP ${list.status}  ${hint}`);
    console.log(`  ${list.body}`);
    return false;
  }

  const hit = list.entries.find((e) => e.name.toLowerCase() === FILE.toLowerCase());
  console.log(`  LIST ${SCAN_DIR} → ${list.entries.length} ไฟล์`);
  console.log(
    `    ${FILE}: ${hit ? `พบ (${hit.size.toLocaleString()} bytes, ${hit.lastModified})` : "✗ ไม่พบ"}`
  );

  const others = list.entries.filter((e) => e.name !== hit?.name);
  if (others.length > 0) {
    console.log(`    ไฟล์อื่นในโฟลเดอร์:`);
    for (const e of others) {
      console.log(`      ${e.name.padEnd(44)} ${e.size.toLocaleString().padStart(14)} bytes  ${e.lastModified}`);
    }
  }
  if (!hit) return false;

  const head = await headBytes(`${SCAN_DIR.replace(/\/$/, "")}/${FILE}`, token);
  if (!head.ok) {
    console.log(`  อ่าน header ไม่ได้ → HTTP ${head.status}: ${head.body}`);
    return false;
  }

  console.log(`\n  HEADER (${head.headers.length} คอลัมน์):`);
  head.headers.forEach((h, i) => console.log(`    ${String(i + 1).padStart(2)}. ${h}`));

  const dataLines = head.lines.slice(1).filter((l) => l.trim().length > 0);
  console.log(`\n  ตัวอย่าง 5 แถวแรก (ดิบ):`);
  for (const l of dataLines.slice(0, 5)) console.log(`    ${l.slice(0, 500)}`);

  // แจกแจงค่าที่ไม่ซ้ำของคอลัมน์ที่น่าจะเป็นรหัสเซลล์ — ใช้ยืนยันว่ากรองตามเซลล์ได้จริง
  const { headers, rows } = parseCsv(head.lines.slice(0, dataLines.length).join("\n"));
  const codeish = headers.filter((h) =>
    /salesman|sales_?code|smcode|empl|staff|cust|product|item|sku|code|name/i.test(h)
  );
  console.log(`\n  ค่าที่พบในคอลัมน์ที่น่าสนใจ (จาก ${rows.length} แถวตัวอย่าง):`);
  for (const h of codeish) {
    const vals = [...new Set(rows.map((r) => (r[h] ?? "").trim()).filter(Boolean))];
    console.log(
      `    ${h.padEnd(28)} ${String(vals.length).padStart(4)} ค่าไม่ซ้ำ · ${vals.slice(0, 6).join(" | ").slice(0, 160)}`
    );
  }

  const salesmen = new Set(
    process.env.VDA_SALESMAN_MAP?.split(",").map((p) => p.split(":")[1]?.trim().toUpperCase()) ?? []
  );
  console.log(`\n  รหัสเซลล์ที่ดูแล VDA (จาก VDA_SALESMAN_MAP): ${[...salesmen].filter(Boolean).join(", ")}`);
  for (const h of headers) {
    const vals = new Set(rows.map((r) => (r[h] ?? "").trim().toUpperCase()));
    const overlap = [...salesmen].filter((s) => s && vals.has(s));
    if (overlap.length > 0) {
      console.log(`    >>> คอลัมน์ "${h}" มีรหัสเซลล์ตรงกัน: ${overlap.join(", ")}`);
    }
  }
  return true;
}

async function main() {
  console.log(`Probe: ${FILE}`);
  for (const profile of ["stock", "masters"] as OnelakeAuthProfile[]) {
    if (await probe(profile)) return;
  }
  console.log("\nอ่านไม่ได้ทั้งสอง profile — 403 = ต้องขอสิทธิ์ SP, 404 = id/ชื่อไฟล์ไม่ถูก");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
