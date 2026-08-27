import {
  fabricMastersReady,
  fabricPromoReady,
  getCustomerDirectory,
  getPromotionCreditDirectory,
  getSalesmanRegistry,
} from "./index";
import { getStockFilterConfig, resolveActiveFromDb } from "./stock-filter-config";
import { getVdaAosBillRegistry } from "./vda-aos-bill";
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

/**
 * ภาคของลูกค้ารหัสนี้ตาม dim_customer — "" เมื่อยังไม่โหลด/หาไม่เจอ
 *
 * ใช้ Area_NameEnglish (BANGKOK / CENTRAL / NORTH EAST / NORTH / SOUTH) ซึ่งเป็นชุด
 * เดียวกับหัวคอลัมน์ภูมิภาคใน cft_promotion_cash.csv (ต่างแค่ช่องว่างของอีสาน
 * ซึ่ง promoServesRegion ตัดให้แล้ว)
 */
function regionForCustomer(code: string): string {
  const c = code.trim();
  if (!c || !fabricMastersReady()) return "";
  return getCustomerDirectory().getByCode(c)?.area?.trim() ?? "";
}

/** ภาคของคลัง — ดูจากรหัสลูกค้าที่ผูกไว้ในทะเบียนคลัง (หน้า /admin/data/warehouses) */
function regionForVda(vdaCode: string): string {
  for (const cc of getVdaAosBillRegistry().getCustomerCodesForVda(vdaCode)) {
    const region = regionForCustomer(cc);
    if (region) return region;
  }
  return "";
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
  /**
   * ภาคเป็นค่าที่อ่านจากข้อมูลได้เอง env จึงเป็นแค่ "ตาข่ายรับ" ตอนหาไม่เจอ ไม่ใช่ตัวทับ
   *
   * เดิมตรงนี้ตรึงเป็น COUNTRY ทุกร้าน ทำให้เงื่อนไขหลังของ promoServesRegion
   * (row.regions.has(region)) กลายเป็น has("COUNTRY") ซ้ำกับเงื่อนไขแรก →
   * แถวโปรเฉพาะภาคไม่มีทางเข้าเกณฑ์เลยสักแถว ทั้งที่ไฟล์มีอยู่ 61 แถว
   *
   * COUNTRY ในไฟล์แปลว่า "ได้ทั้งประเทศ" การถอยมาใช้ค่านี้จึงปลอดภัย: ร้านยังได้โปร
   * ทั้งประเทศครบเหมือนเดิม แค่ไม่ได้ของเฉพาะภาคจนกว่าจะรู้ว่าอยู่ภาคไหน
   */
  const fallbackRegion = trimEnv("C4_DEFAULT_REGION") || "COUNTRY";
  const defaultDivision =
    trimEnv("C4_DEFAULT_DIVISION") || fromFile?.division || "S";
  const vdaMap = parseVdaDivisionMap();

  if (isVdaCode(code)) {
    const vda = code.toLowerCase();
    return {
      division: vdaMap.get(vda) ?? defaultDivision,
      cusgroup: defaultCusgroup,
      region: regionForVda(vda) || fallbackRegion,
      isVda: true,
      vdaCode: vda,
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
      /**
       * ภาคมาจาก "ร้าน" ไม่ใช่คลัง — โปรเฉพาะภาคคือเงื่อนไขของพื้นที่ที่ขายของ
       * ต่างจาก division/cusgroup ที่เป็นเงื่อนไขของคลัง (ร้านสั่งผ่านคลังจึงใช้ของคลัง)
       * ถอยไปใช้ภาคของคลังเมื่อหาร้านใน dim_customer ไม่เจอ
       */
      region: regionForCustomer(code) || regionForVda(vda) || fallbackRegion,
      isVda: false,
      vdaCode: vda,
      storeCode: code,
    };
  }

  // ไม่มีคลังในระบบให้อ้างอิง (stock cover ยังไม่โหลด) — ถอยไปใช้ข้อมูลลูกค้าแบบเดิม
  let cusgroup = defaultCusgroup;
  let region = fallbackRegion;
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
