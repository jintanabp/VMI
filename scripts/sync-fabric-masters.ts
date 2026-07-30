/**
 * ดึง master ทั้งหมดจาก Fabric OneLake (พอร์ตมาจาก ocr-po-matching/backend/master_refresh.py)
 *
 * Usage: npm run sync:masters [-- --interactive]
 *
 * --interactive = ยอมให้เปิดเบราว์เซอร์ล็อกอินเมื่อไม่มี client secret
 *   ใช้ได้เฉพาะที่นี่ (CLI มี TTY) — ฝั่งเซิร์ฟเวอร์ห้ามใช้ เพราะจะค้างจน timeout
 */
import { localFileStats, reloadFabricMasters } from "../lib/fabric";
import {
  bootstrapMissingMasters,
  getDatasetInventory,
} from "../lib/fabric/datasets";
import { refreshAllMasters } from "../lib/fabric/onelake-refresh";
import { writeDatasetStatus } from "../lib/fabric/refresh-status";

function fmtBytes(n: number | null): string {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const allowInteractive = process.argv.includes("--interactive");

  console.log("VMI Fabric master sync");
  for (const row of getDatasetInventory()) {
    console.log(
      `  ${row.id.padEnd(18)} → ${row.fileName}` +
        (row.configured ? "" : "  (ยังไม่ได้ตั้งค่า env)")
    );
  }

  const bootstrapped = await bootstrapMissingMasters();
  if (bootstrapped.length > 0) {
    console.log(`\nโหลดไฟล์ที่ขาด ${bootstrapped.length} ไฟล์`);
    writeDatasetStatus(bootstrapped, "cli");
  }

  const result = await refreshAllMasters({ allowInteractive });
  writeDatasetStatus(result.datasets, "cli");

  console.log("\nผลการดึงข้อมูล:");
  for (const d of result.datasets) {
    const state = d.ok ? "OK  " : d.skipped ? "SKIP" : "FAIL";
    console.log(
      `  ${state} ${d.name.padEnd(18)} ${String(d.rows ?? "-").padStart(8)} แถว  ` +
        `${fmtBytes(d.bytes).padStart(9)}  ${d.durationMs}ms` +
        (d.error ? `  ← ${d.error}` : "")
    );
  }

  console.log("\nไฟล์ในเครื่อง:");
  for (const row of getDatasetInventory()) {
    const stats = localFileStats(row.localPath);
    console.log(`  ${row.fileName.padEnd(38)}`, stats ?? "(ไม่มีไฟล์)");
  }

  reloadFabricMasters();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
