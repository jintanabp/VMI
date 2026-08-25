import { fabricPromoReady, getPromotionCreditDirectory } from "./index";
import { isEmptyBenefitRow, filterCandidateRows } from "./promotion-lookup";
import { resolvePromoContext } from "./promotion-context";
import { readMasterRefreshStatus, writeMasterRefreshStatus } from "./refresh-status";
import { fabricStockReady, getStockCoverDirectory } from "./stock-cover";
import { listStockFromDbSources } from "./stock-rows";

/** ปริมาณโปรที่วัดได้จากไฟล์ชุดหนึ่ง — เอาไว้เทียบข้ามรอบ sync */
export interface PromoCoverageSnapshot {
  at: string;
  /** SKU ที่คลังมีของจริง และหาโปรที่ให้ส่วนลด/ของแถมเจอ */
  skusWithPromo: number;
  /** SKU ที่คลังมีของจริงทั้งหมด — ตัวหารของอัตราส่วน */
  skusChecked: number;
  byStore: Record<string, { withPromo: number; checked: number }>;
  /** (division|cusgroup) ที่มีอยู่จริงในไฟล์ — ช่วยไล่เหตุตอนตัวเลขตก */
  contextsInFile: string[];
}

/** ตกเกินกี่ % ถึงจะเตือน — ตั้ง PROMO_COVERAGE_DROP_ALERT_PCT ทับได้ */
function alertDropPct(): number {
  const raw = Number.parseFloat(
    process.env.PROMO_COVERAGE_DROP_ALERT_PCT ?? ""
  );
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : 30;
}

/**
 * คลังที่ต้องเฝ้า
 *
 * ถ้า C4_VDA_DIVISION_MAP ไม่ได้ตั้ง ต้องถอยไปใช้คลังที่มีจริงใน stock cover
 * **ห้ามคืนลิสต์ว่างแล้วข้ามการตรวจ** — env ตัวนี้ไม่ได้ตั้งคือหนึ่งในสาเหตุที่ทำให้
 * ไม่มีโปรทั้งระบบ (division ถอยไปเป็นค่า default ที่ไม่ตรงกับไฟล์) ยามที่ปิดตัวเอง
 * ตอน env หาย จึงเงียบพอดีในรอบที่ควรจะส่งเสียงดังที่สุด
 */
function watchedStores(): string[] {
  const mapped = (process.env.C4_VDA_DIVISION_MAP ?? "")
    .split(",")
    .map((p) => p.split(":")[0]?.trim())
    .filter((c): c is string => Boolean(c));
  return mapped.length > 0 ? mapped : listStockFromDbSources();
}

/**
 * นับ SKU ที่ได้โปรจริง ณ ตอนนี้ — null เมื่อยังวัดไม่ได้ (ไฟล์ยังไม่พร้อม)
 *
 * นับเฉพาะแถวที่ให้ส่วนลดหรือของแถมจริง ไม่ใช่แค่ "มีแถว" — C4 มีแถวที่จับสินค้า
 * เข้ากลุ่มไว้เฉย ๆ โดยไม่ให้อะไรเลยอยู่ 594 แถว ถ้านับรวมด้วย ตัวเลขจะไม่ขยับ
 * ในวันที่ส่วนลดหายไปทั้งไฟล์ ซึ่งเป็นวันที่เราต้องการให้มันขยับที่สุด
 */
export function measurePromoCoverage(): PromoCoverageSnapshot | null {
  if (!fabricPromoReady() || !fabricStockReady()) return null;

  const dir = getPromotionCreditDirectory();
  const cover = getStockCoverDirectory();
  if (!cover.isLoaded) return null;

  const byStore: PromoCoverageSnapshot["byStore"] = {};
  let skusWithPromo = 0;
  let skusChecked = 0;

  for (const store of watchedStores()) {
    const ctx = resolvePromoContext(store);
    // ของแถมรหัสขึ้นต้นด้วย 0 ไม่ใช่สินค้าที่ร้านสั่งได้ — ไม่ควรถ่วงตัวหาร
    const products = [
      ...new Set(cover.getForStore(store).map((r) => r.productCode)),
    ].filter((p) => p && !p.startsWith("0"));
    if (products.length === 0) continue;

    let withPromo = 0;
    for (const product of products) {
      const rows = filterCandidateRows(
        dir,
        ctx.division,
        ctx.cusgroup,
        product,
        ctx.region
      );
      if (rows.some((r) => !isEmptyBenefitRow(r))) withPromo++;
    }

    byStore[store] = { withPromo, checked: products.length };
    skusWithPromo += withPromo;
    skusChecked += products.length;
  }

  return {
    at: new Date().toISOString(),
    skusWithPromo,
    skusChecked,
    byStore,
    contextsInFile: [
      ...new Set(dir.allRows().map((r) => `${r.division}|${r.cusgroup}`)),
    ],
  };
}

export interface PromoCoverageVerdict {
  level: "ok" | "warn" | "alarm";
  message: string;
  dropPct: number | null;
  /** คลังที่เคยมีโปรแล้วรอบนี้เหลือศูนย์ — อาการเดียวกับบั๊กที่เคยเกิดจริง */
  storesGoneDark: string[];
}

/**
 * เทียบรอบนี้กับรอบก่อน แล้วบอกว่าต้องส่งเสียงแค่ไหน
 *
 * ที่ต้องเทียบกับรอบก่อน ไม่ใช่ตั้งเกณฑ์ตายตัว: จำนวน SKU ที่มีโปรเปลี่ยนทุกเดือน
 * ตามที่การตลาดออกโปร เลขสัมบูรณ์จึงตั้งเกณฑ์ไม่ได้ แต่ "หายไปครึ่งหนึ่งในรอบเดียว"
 * ผิดปกติเสมอไม่ว่าเดือนไหน
 */
export function comparePromoCoverage(
  prev: PromoCoverageSnapshot | undefined,
  next: PromoCoverageSnapshot
): PromoCoverageVerdict {
  const storesGoneDark = Object.entries(next.byStore)
    .filter(
      ([store, now]) =>
        now.withPromo === 0 && (prev?.byStore[store]?.withPromo ?? 0) > 0
    )
    .map(([store]) => store);

  if (next.skusChecked > 0 && next.skusWithPromo === 0) {
    return {
      level: "alarm",
      message:
        `ไม่มี SKU ไหนได้โปรเลยสักตัวจาก ${next.skusChecked} ตัวที่ตรวจ — ` +
        `บริบทที่มีในไฟล์: ${next.contextsInFile.join(", ") || "(ไม่มี)"}`,
      dropPct: prev && prev.skusWithPromo > 0 ? 100 : null,
      storesGoneDark,
    };
  }

  if (!prev || prev.skusWithPromo === 0) {
    return {
      level: "ok",
      message: `SKU ที่มีโปร ${next.skusWithPromo}/${next.skusChecked} (ยังไม่มีรอบก่อนให้เทียบ)`,
      dropPct: null,
      storesGoneDark,
    };
  }

  const dropPct =
    ((prev.skusWithPromo - next.skusWithPromo) / prev.skusWithPromo) * 100;

  if (storesGoneDark.length > 0) {
    return {
      level: "alarm",
      message: `คลังที่โปรหายเกลี้ยงรอบนี้: ${storesGoneDark.join(", ")} (รอบก่อนยังมีอยู่)`,
      dropPct,
      storesGoneDark,
    };
  }

  if (dropPct >= alertDropPct()) {
    return {
      level: "warn",
      message:
        `SKU ที่มีโปรตกจาก ${prev.skusWithPromo} เหลือ ${next.skusWithPromo} ` +
        `(-${dropPct.toFixed(1)}%) เกินเกณฑ์ ${alertDropPct()}%`,
      dropPct,
      storesGoneDark,
    };
  }

  return {
    level: "ok",
    message: `SKU ที่มีโปร ${next.skusWithPromo}/${next.skusChecked} (รอบก่อน ${prev.skusWithPromo})`,
    dropPct,
    storesGoneDark,
  };
}

/**
 * วัด เทียบกับรอบก่อน ส่งเสียง แล้วบันทึกไว้ให้รอบถัดไปเทียบ
 *
 * เรียกหลัง reloadFabricMasters() ทุกรอบ sync — ล้มตรงนี้ต้องไม่ทำให้รอบ sync ล้ม
 * เพราะเป็นการตรวจสุขภาพ ไม่ใช่ตัวงาน
 */
export function recordPromoCoverage(trigger: string): PromoCoverageVerdict | null {
  try {
    const next = measurePromoCoverage();
    if (!next) return null;

    const prev = readMasterRefreshStatus().promoCoverage;
    const verdict = comparePromoCoverage(prev, next);
    const head = `[PromoCoverage] trigger=${trigger}`;

    if (verdict.level === "alarm") {
      console.error(
        `${head} !!! ${verdict.message} — ` +
          `ตรวจ C4_DEFAULT_DIVISION / C4_DEFAULT_CUSGROUP / C4_VDA_DIVISION_MAP ` +
          `และไฟล์ที่เพิ่ง sync มา (รัน npm run verify:promo-context)`
      );
    } else if (verdict.level === "warn") {
      console.warn(`${head} ${verdict.message}`);
    } else {
      console.info(`${head} ${verdict.message}`);
    }

    writeMasterRefreshStatus({ promoCoverage: next });
    return verdict;
  } catch (err) {
    console.warn("[PromoCoverage] วัดไม่สำเร็จ — ข้ามรอบนี้:", err);
    return null;
  }
}
