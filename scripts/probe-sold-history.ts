/**
 * ตรวจว่า factsales_odoo.csv อยู่ที่ lakehouse ไหน
 * Usage: npx tsx --env-file=.env scripts/probe-sold-history.ts
 */
import { getOnelakeToken } from "../lib/fabric/onelake-credential";

const ONELAKE_HOST = "https://onelake.dfs.fabric.microsoft.com";
const FILE = "factsales_odoo.csv";

async function listDir(
  workspaceId: string,
  itemId: string,
  folder: string,
  token: string
) {
  const dirPath = `${itemId}/${folder.replace(/\/$/, "")}`;
  const url = `${ONELAKE_HOST}/${workspaceId}?resource=filesystem&directory=${encodeURIComponent(dirPath)}&recursive=false`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "x-ms-version": "2020-04-08" },
  });
  const body = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: body.slice(0, 300) };
  const data = JSON.parse(body) as { paths?: { name: string; contentLength?: string }[] };
  const entries = (data.paths ?? []).map((p) => ({
    name: p.name.split("/").pop(),
    size: p.contentLength ?? "-",
  }));
  return { ok: true as const, status: res.status, entries };
}

async function probe(
  label: string,
  workspaceId: string,
  lakehouseId: string,
  profile: "stock" | "masters"
) {
  console.log(`\n=== ${label} (ws=${workspaceId}, lh=${lakehouseId}, auth=${profile}) ===`);
  let token: string;
  try {
    token = await getOnelakeToken(false, profile);
  } catch (e) {
    console.log("  token error:", (e as Error).message);
    return;
  }
  const r = await listDir(workspaceId, lakehouseId, "Files/exports/", token);
  if (!r.ok) {
    console.log(`  HTTP ${r.status}: ${r.body}`);
    return;
  }
  const hit = r.entries.find((e) => e.name === FILE);
  console.log(`  Files/exports/ has ${r.entries.length} entries`);
  if (hit) console.log(`  >>> FOUND ${FILE} (${hit.size} bytes)`);
  else console.log(`  ${FILE} NOT here. sample:`, r.entries.slice(0, 10).map((e) => e.name));
}

async function main() {
  await probe(
    "Stock LH",
    process.env.STOCK_ONELAKE_WORKSPACE_ID || "650809d9-f661-4d2b-9e4b-0d50c00f17e1",
    process.env.STOCK_ONELAKE_LAKEHOUSE_ID || "9c46be00-802f-4b15-a1d2-60dc9d05114e",
    "stock"
  );
  await probe(
    "Masters LH",
    process.env.ONELAKE_WORKSPACE_ID || "e037fd08-5f8d-4a6d-8c5e-f25886bd238d",
    process.env.ONELAKE_LAKEHOUSE_ID || "7894759b-bb65-4a2b-963d-b19801542fa0",
    "masters"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
