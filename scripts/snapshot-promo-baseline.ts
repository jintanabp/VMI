/**
 * เก็บ snapshot สรุปตาราง C4 ที่โหลดอยู่ตอนนี้ ไว้เทียบก่อน/หลังสลับไฟล์
 * Usage: npm run snapshot:promo -- <ไฟล์ผลลัพธ์.json>
 *
 * ทำไมต้องมี: หลังสลับไป cft_promotion_cash.csv คำว่า "ดูโอเค" พิสูจน์ไม่ได้
 * ถ้าไม่มีตัวเลขก่อนหน้าเทียบ — โหมดล้มที่อันตรายที่สุดคือโหลดสำเร็จแต่ไม่ match อะไรเลย
 */
import fs from "fs";
import path from "path";
import { PromotionCredit, promoActiveOn, promoServesRegion } from "../lib/fabric/promotion-credit";
import { getPromotionCsvPath } from "../lib/fabric/paths";

const outPath = process.argv[2] ?? "promo-baseline.json";

function top(counts: Map<string, number>, n = 15) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k}=${v}`);
}

function main() {
  const csvPath = getPromotionCsvPath();
  const dir = new PromotionCredit();
  dir.load(csvPath);

  if (!dir.isLoaded) {
    console.error(`โหลดไม่สำเร็จ: ${dir.loadError ?? "ไม่ทราบสาเหตุ"}`);
    process.exit(1);
  }

  // เข้าถึงข้อมูลผ่าน rowsFor ไม่ได้เพราะต้องรู้ key ก่อน — อ่านไฟล์ซ้ำเพื่อนับสถิติ
  const raw = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const iDiv = idx("DIVISIONSALE");
  const iCus = idx("CUSTOMERGROUP");
  const iProd = idx("PRODUCTCODE");
  const iGroup = idx("ASSORTEDPRODUCTGROUP");
  const iDiscAmt = idx("DISCOUNTAMOUNT");
  const iDiscPct = idx("DISCOUNTPERCENT");
  const iPremium = idx("PREMIUMPRODUCT");
  const iUnit = idx("PURCHASEUNIT");
  const iFrom = idx("PURCHASEQUANTITYFROM");

  const divisions = new Map<string, number>();
  const cusgroups = new Map<string, number>();
  const divCus = new Map<string, number>();
  const units = new Map<string, number>();
  const products = new Set<string>();
  const groups = new Set<string>();
  let withDiscBaht = 0;
  let withDiscPct = 0;
  let withPremium = 0;
  const tierStarts = new Map<string, number>();

  const split = (line: string) => {
    // parser เบา ๆ พอสำหรับสถิติ — รองรับค่าใน "..." ที่ไม่มี comma ซ้อน
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  for (const line of lines.slice(1)) {
    const c = split(line);
    const div = c[iDiv] ?? "";
    const cus = c[iCus] ?? "";
    if (!div || !cus) continue;
    divisions.set(div, (divisions.get(div) ?? 0) + 1);
    cusgroups.set(cus, (cusgroups.get(cus) ?? 0) + 1);
    divCus.set(`${div}|${cus}`, (divCus.get(`${div}|${cus}`) ?? 0) + 1);
    units.set(c[iUnit] ?? "", (units.get(c[iUnit] ?? "") ?? 0) + 1);
    if (c[iProd]) products.add(c[iProd]);
    const g = (c[iGroup] ?? "").replace(/^"|"$/g, "").trim();
    if (g) groups.add(g);
    if (Number(c[iDiscAmt]) > 0) withDiscBaht++;
    if (Number(c[iDiscPct]) > 0) withDiscPct++;
    const prem = (c[iPremium] ?? "").trim();
    if (prem && prem !== "0" && prem.toUpperCase() !== "NULL") withPremium++;
    const f = c[iFrom] ?? "";
    tierStarts.set(f, (tierStarts.get(f) ?? 0) + 1);
  }

  const snapshot = {
    csvPath,
    rows: lines.length - 1,
    products: products.size,
    assortedGroups: groups.size,
    divisions: top(divisions),
    cusgroups: top(cusgroups),
    divisionCusgroup: top(divCus, 25),
    purchaseUnits: top(units),
    withDiscBaht,
    withDiscPct,
    withPremium,
    tierStarts: top(tierStarts, 20),
    sampleGroups: [...groups].slice(0, 20),
  };

  fs.writeFileSync(path.resolve(outPath), JSON.stringify(snapshot, null, 2), "utf8");
  console.log(JSON.stringify(snapshot, null, 2));
  console.log(`\nบันทึกไว้ที่ ${path.resolve(outPath)}`);

  // กันไม่ให้ import ที่ไม่ได้ใช้ถูกตัดออก (ใช้จริงตอนตรวจ active/region ในอนาคต)
  void promoActiveOn;
  void promoServesRegion;
}

main();
