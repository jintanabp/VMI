/**
 * ตรวจสิทธิ์ + path ใน workspace stock (ไม่ดาวน์โหลดไฟล์ใหญ่)
 * Usage: npx tsx --env-file=.env scripts/probe-stock-onelake.ts
 */
import { getStockOnelakeConfig } from "../lib/fabric/env";
import { getOnelakeToken } from "../lib/fabric/onelake-credential";

const ONELAKE_HOST = "https://onelake.dfs.fabric.microsoft.com";

async function listDir(
  workspaceId: string,
  itemId: string,
  folder: string,
  token: string
) {
  const dirPath = `${itemId}/${folder.replace(/\/$/, "")}`;
  const url = `${ONELAKE_HOST}/${workspaceId}?resource=filesystem&directory=${encodeURIComponent(dirPath)}&recursive=false`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2020-04-08",
    },
  });

  const body = await res.text();
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: body.slice(0, 500) };
  }

  const data = JSON.parse(body) as {
    paths?: { name: string; isDirectory?: boolean; contentLength?: string }[];
  };
  const entries = (data.paths ?? []).map((p) => ({
    name: p.name.split("/").pop(),
    isDirectory: Boolean(p.isDirectory),
    size: p.contentLength ?? "-",
  }));

  return { ok: true as const, status: res.status, entries };
}

async function headFile(
  workspaceId: string,
  itemId: string,
  filePath: string,
  token: string
) {
  const url = `${ONELAKE_HOST}/${workspaceId}/${itemId}/${filePath}`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2020-04-08",
    },
  });
  const body = res.ok ? "" : (await res.text()).slice(0, 500);
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const cfg = getStockOnelakeConfig();
  if (!cfg) {
    console.error("ตั้ง STOCK_ONELAKE_WORKSPACE_ID + ONELAKE_WAREHOUSE_ID ใน .env ก่อน");
    process.exit(1);
  }

  console.log("Stock workspace:", cfg.workspaceId);
  console.log("Export item id: ", cfg.exportItemId);
  console.log("");

  const token = await getOnelakeToken(false, "stock");

  const paths = [
    "Files/exports/",
    "Files/",
    "Tables/dbo/stock_cover_day/",
    "Tables/dbo/",
    "Tables/",
  ];

  for (const folder of paths) {
    console.log(`--- LIST ${folder} ---`);
    const result = await listDir(cfg.workspaceId, cfg.exportItemId, folder, token);
    if (!result.ok) {
      console.log(`  HTTP ${result.status}: ${result.body}`);
    } else {
      console.log(`  HTTP ${result.status}, ${result.entries.length} entries`);
      for (const e of result.entries.slice(0, 15)) {
        console.log(`    ${e.isDirectory ? "[dir]" : "[file]"} ${e.name} (${e.size})`);
      }
      if (result.entries.length > 15) {
        console.log(`    ... +${result.entries.length - 15} more`);
      }
    }
    console.log("");
  }

  const csvPath =
    process.env.STOCK_COVER_ONELAKE_PATH?.trim() ||
    "Files/exports/stock_cover_day.csv";
  console.log(`--- HEAD ${csvPath} ---`);
  const head = await headFile(cfg.workspaceId, cfg.exportItemId, csvPath, token);
  console.log(head.ok ? `  OK (${head.status})` : `  HTTP ${head.status}: ${head.body}`);
  console.log("");
  console.log("หมายเหตุ:");
  console.log("  403 = SP ยังไม่มีสิทธิ์ workspace/warehouse (ไม่ใช่แค่ไม่มีไฟล์)");
  console.log("  404 = path ไม่มี — Mirrored Warehouse ไม่มี Files/ ต้อง export ไป Lakehouse");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
