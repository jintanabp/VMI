import {
  fabricMastersReady,
  getCustomerDirectory,
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
  const defaultCusgroup = trimEnv("C4_DEFAULT_CUSGROUP") || "99";
  const defaultRegion = trimEnv("C4_DEFAULT_REGION") || "COUNTRY";
  const defaultDivision = trimEnv("C4_DEFAULT_DIVISION") || "S";
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
