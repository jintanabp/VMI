/**
 * เช็คว่า "ยอดเฉลี่ย N วัน" ที่แอปคำนวณจาก factsales_odoo.csv
 * ตรงกับคอลัมน์ avg_qty_out_L7 / avg_qty_out_L30 ใน stock_cover_day.csv หรือไม่
 *
 * ใช้ logic การเฉลี่ยแบบเดียวกับ SoldHistoryDirectory.getSummary:
 *   end = วันล่าสุดใน factsales, avg = ผลรวมในหน้าต่าง [end-(N-1) .. end] / N
 *
 * Usage: npm run verify:sales-cover
 * exit code 1 ถ้าพบ mismatch (ใช้ใน CI ได้)
 */
import { readCsvFile } from "../lib/fabric/csv";
import { getSoldHistoryCsvPath, getStockCoverCsvPath } from "../lib/fabric/paths";
import { normalizeStoreKey as normStoreKey } from "../lib/fabric/store-key";

const WINDOWS = [7, 30] as const;
const TOLERANCE = 0.01;

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function num(raw: string | undefined): number {
  const n = Number.parseFloat((raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function get(row: Record<string, string>, ...keys: string[]): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v;
  for (const k of keys) if (lower[k] !== undefined) return lower[k];
  return "";
}

function main() {
  const factPath = getSoldHistoryCsvPath();
  const coverPath = getStockCoverCsvPath();

  console.log(`factsales   → ${factPath}`);
  console.log(`stock_cover → ${coverPath}\n`);

  // ── factsales: (productcode|vda) -> date -> qty ─────────────────────────────
  const fact = readCsvFile(factPath).rows;
  const byKey = new Map<string, Map<string, number>>();
  let latestDate = "";
  for (const r of fact) {
    const code = get(r, "productcode", "product_code", "sku").trim();
    const date = get(r, "date_invoice", "date").slice(0, 10);
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const vda = normStoreKey(get(r, "source", "from_db", "customercode"));
    const qty = num(get(r, "unit_qty", "qty", "quantity"));
    const key = `${code}|${vda}`;
    let m = byKey.get(key);
    if (!m) byKey.set(key, (m = new Map()));
    m.set(date, (m.get(date) ?? 0) + qty);
    if (date > latestDate) latestDate = date;
  }

  // avg ต่อ window แบบเดียวกับแอป (end = latestDate)
  const avgFor = (m: Map<string, number>, days: number): number => {
    let total = 0;
    for (let i = 0; i < days; i++) total += m.get(addDays(latestDate, -i)) ?? 0;
    return total / days;
  };

  // ── stock_cover: (productcode|from_db) -> {L7, L30, snapshot} ────────────────
  const cover = readCsvFile(coverPath).rows;
  const sc = new Map<string, { l7: number; l30: number }>();
  let snapshot = "";
  for (const r of cover) {
    const code = get(r, "productcode").trim();
    const db = normStoreKey(get(r, "from_db"));
    const date = get(r, "date").slice(0, 10);
    if (date > snapshot) snapshot = date;
    if (!code || !db) continue;
    sc.set(`${code}|${db}`, {
      l7: num(get(r, "avg_qty_out_l7")),
      l30: num(get(r, "avg_qty_out_l30")),
    });
  }

  // ── window alignment check ──────────────────────────────────────────────────
  const expectedEnd = snapshot ? addDays(snapshot, -1) : "";
  const aligned = latestDate === expectedEnd;
  console.log(`factsales วันล่าสุด : ${latestDate}`);
  console.log(`stock_cover snapshot: ${snapshot}  (L7 window ควรจบที่ ${expectedEnd})`);
  console.log(
    aligned
      ? "หน้าต่างวัน: ตรงกัน ✓\n"
      : `⚠️  หน้าต่างวันเหลื่อมกัน — factsales จบ ${latestDate} แต่ stock_cover คาดหวัง ${expectedEnd}\n` +
        "   (ต้องรัน factsales notebook วันเดียวกับ stock_cover ค่าถึงจะตรง)\n"
  );

  // ── compare ─────────────────────────────────────────────────────────────────
  let joined = 0;
  let factOnly = 0;
  const miss: Record<number, number> = { 7: 0, 30: 0 };
  const samples: string[] = [];

  for (const [key, m] of byKey) {
    const scRow = sc.get(key);
    if (!scRow) {
      factOnly++;
      continue;
    }
    joined++;
    for (const w of WINDOWS) {
      const app = avgFor(m, w);
      const ref = w === 7 ? scRow.l7 : scRow.l30;
      if (Math.abs(app - ref) >= TOLERANCE) {
        miss[w]++;
        if (samples.length < 12) {
          const [c, v] = key.split("|");
          samples.push(
            `  L${w} ${c.padEnd(9)} ${v.padEnd(5)} app=${app.toFixed(2)} sc=${ref.toFixed(2)} d=${(app - ref).toFixed(2)}`
          );
        }
      }
    }
  }

  let coverOnly = 0;
  for (const key of sc.keys()) if (!byKey.has(key)) coverOnly++;

  if (samples.length) {
    console.log("ตัวอย่าง mismatch:");
    console.log(samples.join("\n"), "\n");
  }
  console.log("─".repeat(48));
  console.log(`คู่ (product, vda) ที่จับคู่ได้ : ${joined.toLocaleString()}`);
  console.log(`L7  ตรง : ${(joined - miss[7]).toLocaleString()}   mismatch: ${miss[7]}`);
  console.log(`L30 ตรง : ${(joined - miss[30]).toLocaleString()}   mismatch: ${miss[30]}`);
  console.log(`มีใน factsales อย่างเดียว  : ${factOnly.toLocaleString()}`);
  console.log(`มีใน stock_cover อย่างเดียว: ${coverOnly.toLocaleString()} (สินค้าไม่มีขายในหน้าต่าง = 0 ทั้งคู่)`);
  console.log("─".repeat(48));

  const failed = !aligned || miss[7] > 0 || miss[30] > 0;
  console.log(failed ? "ผล: FAIL" : "ผล: PASS ✅");
  process.exit(failed ? 1 : 0);
}

main();
