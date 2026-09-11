/**
 * พรีวิว payload ที่จะส่งเข้า ERP — **อ่านอย่างเดียว ไม่ยิงอะไรออกไปไหน**
 *
 * ใช้ตอนที่ยังไม่มี UAT และห้ามยิง production: เอาไฟล์ที่ได้ไปให้ทีม ERP ตรวจว่ารูปแบบ
 * ตรงกับสเปก `insertOCROrderToBill` ของเขาไหม ก่อนจะต่อขาส่งจริง (เฟส 2)
 *
 * Usage:
 *   npm run erp:preview -- V126082801A          # ใบเดียว
 *   npm run erp:preview -- --all                # ทุกใบที่ยังไม่ยกเลิก (จำกัด 50 ใบล่าสุด)
 *   npm run erp:preview -- --all --limit 200
 *
 * ผลลัพธ์: สรุปบนจอ + ไฟล์ JSON ที่ `logs/erp-preview/{poNumber}.json`
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { rebuildPoDocumentFromDb } from "../lib/po/po-from-db";
import { buildErpPayload, checkErpReadiness, erpReasonLabel } from "../lib/po/erp-payload";
import { buildErpContext } from "../lib/po/erp-context";
import { warmFabricMasters } from "../lib/fabric";
import { refreshVdaWarehouseCache } from "../lib/fabric/vda-warehouse-registry";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const all = args.includes("--all");
  const limitIdx = args.indexOf("--limit");
  const limit =
    limitIdx >= 0 ? Math.max(1, Number.parseInt(args[limitIdx + 1] ?? "50", 10) || 50) : 50;
  const poNumbers = args.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  return { all, limit, poNumbers };
}

async function main() {
  const { all, limit, poNumbers } = parseArgs(process.argv);
  if (!all && poNumbers.length === 0) {
    console.error("ต้องระบุเลข PO หรือใช้ --all");
    process.exit(1);
  }

  /**
   * ลำดับสำคัญ — ต้องเหมือน instrumentation.ts ตอนแอปบูต
   *
   * ทะเบียนคลัง (DB) ต้องมาก่อน เพราะทะเบียนรหัสเซลส์ (`vda_aos_bill`) สร้างตัวเอง
   * จากรหัสลูกค้าของคลัง แล้ว**แคชผลไว้** — ถ้าโหลด master ก่อน จะได้ทะเบียนเปล่า
   * ค้างไว้ แล้วทุกใบจะรายงานว่า "ไม่รู้รหัสเซลส์" ทั้งที่ตั้งไว้แล้ว
   */
  console.log("โหลดทะเบียนคลังและ master ก่อน (รหัสลูกค้า/รหัสเซลส์/VatStatus/ราคา)...");
  await refreshVdaWarehouseCache();
  warmFabricMasters();

  const targets = all
    ? (
        await prisma.purchaseOrder.findMany({
          where: { status: { not: "cancelled" } },
          orderBy: { issuedAt: "desc" },
          take: limit,
          select: { poNumber: true },
        })
      ).map((p) => p.poNumber)
    : poNumbers;

  const dir = path.join(process.cwd(), "logs", "erp-preview");
  await mkdir(dir, { recursive: true });

  let ready = 0;
  const blockedBy = new Map<string, number>();

  for (const poNumber of targets) {
    const doc = await rebuildPoDocumentFromDb(poNumber);
    if (!doc) {
      console.log(`✗ ${poNumber} — ไม่พบ PO นี้`);
      continue;
    }
    const ctx = buildErpContext({
      storeCode: doc.storeCode,
      approvedAt: doc.approvedAt,
      deliveryDate: doc.deliveryDate,
    });
    const payload = buildErpPayload(doc, ctx);
    const readiness = checkErpReadiness(doc, ctx);

    await writeFile(
      path.join(dir, `${poNumber}.json`),
      JSON.stringify({ payload, readiness, context: ctx }, null, 2),
      "utf-8"
    );

    if (readiness.ok) {
      ready++;
      console.log(
        `✓ ${poNumber} — พร้อม · ${payload.countItem} รายการ · ลูกค้า ${payload.customerCode}`
      );
    } else {
      for (const r of readiness.reasons) {
        blockedBy.set(r, (blockedBy.get(r) ?? 0) + 1);
      }
      console.log(`✗ ${poNumber} — ${readiness.reasons.length} เรื่อง`);
      for (const r of readiness.reasons) {
        const skus = readiness.offendingSkus[r];
        console.log(
          `    · ${erpReasonLabel(r)}${skus?.length ? ` (${skus.slice(0, 5).join(", ")})` : ""}`
        );
      }
    }
  }

  console.log(`\nสรุป: พร้อม ${ready} / ${targets.length} ใบ · ไฟล์อยู่ที่ ${dir}`);
  if (blockedBy.size > 0) {
    console.log("เหตุผลที่พบบ่อย:");
    for (const [r, n] of [...blockedBy].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n} ใบ — ${erpReasonLabel(r as never)}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
