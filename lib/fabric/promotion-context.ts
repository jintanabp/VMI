import {
  fabricMastersReady,
  getCustomerDirectory,
  getSalesmanRegistry,
} from "./index";
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

export function resolvePromoContext(
  storeCode: string,
  options?: { salesRepEmail?: string | null }
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
