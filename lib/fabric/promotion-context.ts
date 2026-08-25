import {
  fabricMastersReady,
  fabricPromoReady,
  getCustomerDirectory,
  getPromotionCreditDirectory,
  getSalesmanRegistry,
} from "./index";
import { getStockFilterConfig, resolveActiveFromDb } from "./stock-filter-config";
import { fabricStockReady } from "./stock-cover";
import { listStockFromDbSources } from "./stock-rows";

export interface PromoLookupContext {
  division: string;
  cusgroup: string;
  region: string;
  isVda: boolean;
  vdaCode?: string;
  storeCode?: string;
}

function trimEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function parseVdaDivisionMap(): Map<string, string> {
  const map = new Map<string, string>();
  const raw = trimEnv("C4_VDA_DIVISION_MAP");
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const [vda, div] = part.split(":").map((s) => s.trim());
    if (vda && div) map.set(vda.toLowerCase(), div);
  }
  return map;
}

/**
 * บริบทที่อ่านได้จากไฟล์เอง — null เมื่อเดาไม่ได้ (ยังไม่โหลด หรือมีหลายชุด)
 *
 * ตาราง C4 cash ที่ใช้จริงมีชุดเดียวคือ E|98 ทั้งไฟล์ และ VDA ของเราเป็น division E
 * ทุกตัว การให้คนมาตั้ง C4_DEFAULT_DIVISION / C4_VDA_DIVISION_MAP จึงไม่ได้ให้ทางเลือกอะไร
 * แต่ให้ช่องพลาดเต็ม ๆ: ถ้าลืมตั้งบน server ตัวใดตัวหนึ่ง โค้ดจะถอยไป S|99 ซึ่งไม่มีในไฟล์
 * แล้วร้านไม่เห็นโปรเลยแบบเงียบ ๆ (เกิดจริงบน production 25 ส.ค. 2026)
 *
 * อ่านจากไฟล์แทน แล้วปล่อยให้ env เป็นตัว override เมื่อวันหนึ่งต้นทางซอยหลายชุดจริง ๆ
 */
function contextFromFile(): { division: string; cusgroup: string } | null {
  if (!fabricPromoReady()) return null;
  const ctxs = getPromotionCreditDirectory().contexts();
  return ctxs.length === 1 ? ctxs[0]! : null;
}

function isVdaCode(code: string): boolean {
  if (!fabricStockReady()) return false;
  return listStockFromDbSources().some(
    (s) => s.toLowerCase() === code.toLowerCase()
  );
}

/**
 * คลัง VDA ที่จ่ายของให้ร้านนี้ — null = ยังไม่มีคลังในระบบ (stock cover ไม่พร้อม)
 *
 * ใช้ resolveActiveFromDb ตัวเดียวกับที่ buildFabricStockPayload ใช้เลือกคลัง
 * บริบทโปรกับแถวสต็อกที่ร้านเห็นจึงมาจากคลังเดียวกันเสมอ ไม่ต้องซิงก์กฎสองที่
 */
function resolveSupplyingVda(
  code: string,
  requestedFromDb?: string | null
): string | null {
  if (!fabricStockReady()) return null;
  const config = getStockFilterConfig();
  return resolveActiveFromDb(
    listStockFromDbSources(config),
    requestedFromDb ?? code,
    config
  );
}

export function resolvePromoContext(
  storeCode: string,
  options?: { salesRepEmail?: string | null; fromDb?: string | null }
): PromoLookupContext {
  const code = storeCode.trim();
  // ลำดับ: env ที่ตั้งไว้ชัดเจน → บริบทที่อ่านได้จากไฟล์ → ค่าเดิมที่เคยฮาร์ดโค้ดไว้
  // ค่าสุดท้ายเหลือไว้เผื่อไฟล์มีหลายชุดและไม่มีใครตั้ง env — ซึ่งควรดังตั้งแต่ตอน boot แล้ว
  const fromFile = contextFromFile();
  const defaultCusgroup =
    trimEnv("C4_DEFAULT_CUSGROUP") || fromFile?.cusgroup || "99";
  const defaultRegion = trimEnv("C4_DEFAULT_REGION") || "COUNTRY";
  const defaultDivision =
    trimEnv("C4_DEFAULT_DIVISION") || fromFile?.division || "S";
  const vdaMap = parseVdaDivisionMap();

  if (isVdaCode(code)) {
    return {
      division: vdaMap.get(code.toLowerCase()) ?? defaultDivision,
      cusgroup: defaultCusgroup,
      region: defaultRegion,
      isVda: true,
      vdaCode: code.toLowerCase(),
    };
  }

  /**
   * ร้านค้าใช้บริบทของคลังที่จ่ายของให้ ไม่ใช่ของรหัสลูกค้าตัวเอง
   *
   * โปรชุดนี้คือ "C4 VDA (Cash)" — เป็นเงื่อนไขของคลัง ร้านสั่งผ่านคลังจึงได้เงื่อนไข
   * เดียวกับคลัง เดิมอ่าน (cusGroup, area) จาก dim_customer ตรง ๆ ซึ่งร้านจริงเป็น
   * cusgroup 99 ทุกร้าน แต่ cft_promotion_cash.csv มีบริบทเดียวคือ E|98 ทั้งไฟล์
   * → rowsFor() คืน 0 แถวเสมอ ร้านค้าจึงไม่เห็นโปรสักตัวแบบเงียบ ๆ ทั้งหน้าสต็อก
   * หน้า order และ snapshot c4* ตอนส่งออเดอร์
   *
   * salesRepEmail ไม่มีผลตรงนี้โดยตั้งใจ — โปรผูกกับคลัง ไม่ได้ผูกกับเซลล์ที่เปิดดู
   */
  const supplier = resolveSupplyingVda(code, options?.fromDb);
  if (supplier) {
    const vda = supplier.toLowerCase();
    return {
      division: vdaMap.get(vda) ?? defaultDivision,
      cusgroup: defaultCusgroup,
      region: defaultRegion,
      isVda: false,
      vdaCode: vda,
      storeCode: code,
    };
  }

  // ไม่มีคลังในระบบให้อ้างอิง (stock cover ยังไม่โหลด) — ถอยไปใช้ข้อมูลลูกค้าแบบเดิม
  let cusgroup = defaultCusgroup;
  let region = defaultRegion;
  let division = defaultDivision;

  if (fabricMastersReady()) {
    const customer = getCustomerDirectory().getByCode(code);
    if (customer?.cusGroup) cusgroup = customer.cusGroup;
    if (customer?.area) region = customer.area;
  }

  if (options?.salesRepEmail) {
    const rep = getSalesmanRegistry().getCurrentByEmail(options.salesRepEmail);
    if (rep?.divisionCode) division = rep.divisionCode;
  }

  return {
    division,
    cusgroup,
    region,
    isVda: false,
    storeCode: code,
  };
}
