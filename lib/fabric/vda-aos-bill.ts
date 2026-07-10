import fs from "fs";
import { readCsvFile } from "./csv";
import { getVdaAosCsvPath } from "./paths";

const VDA_KEYS = ["vda1", "vda2", "vda3", "vda4", "vda5"] as const;

const SALESMAN_COLUMNS = [
  "salesmancode",
  "salesman_code",
  "salesman",
  "smcode",
  "sales_code",
];

const CUSTOMER_COLUMNS = [
  "customercode",
  "customer_code",
  "custcode",
  "cust_code",
  "customer",
];

function normVda(code: string): string {
  return code.trim().toLowerCase();
}

function normSalesman(code: string): string {
  return code.trim().toUpperCase();
}

function pickColumn(headers: string[], candidates: string[]): string | null {
  const lower = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  for (const c of candidates) {
    const hit = lower.get(c);
    if (hit) return hit;
  }
  return null;
}

function pickSalesmanColumn(headers: string[]): string | null {
  return pickColumn(headers, SALESMAN_COLUMNS);
}

function normCustomer(code: string): string {
  return code.trim().toLowerCase();
}

function parseEnvMap(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of raw.split(",")) {
    const [vda, sm] = part.split(":").map((s) => s.trim());
    if (vda && sm) out.set(normVda(vda), normSalesman(sm));
  }
  return out;
}

export class VdaAosBillRegistry {
  private byVda = new Map<string, Map<string, number>>();
  private bySalesman = new Map<string, Set<string>>();
  // vda -> รหัสลูกค้า (customercode) ที่อยู่ในบิลของ VDA นั้น — ใช้กรองยอดขายรายวัน
  private customersByVda = new Map<string, Set<string>>();

  get isLoaded() {
    return this.byVda.size > 0;
  }

  clear() {
    this.byVda.clear();
    this.bySalesman.clear();
    this.customersByVda.clear();
  }

  loadEnvFallback() {
    const raw = process.env.VDA_SALESMAN_MAP?.trim();
    if (!raw) return;
    this.clear();
    for (const [vda, sm] of parseEnvMap(raw)) {
      this.addCode(vda, sm);
    }
    console.info(`[VdaAosBill] Loaded ${this.byVda.size} VDA(s) from VDA_SALESMAN_MAP`);
  }

  loadCsv(vdaKey: string, csvPath: string): boolean {
    if (!fs.existsSync(csvPath)) return false;

    const { headers, rows } = readCsvFile(csvPath);
    const col = pickSalesmanColumn(headers);
    if (!col) {
      console.warn(`[VdaAosBill] ${csvPath}: no salesmancode column`);
      return false;
    }
    const custCol = pickColumn(headers, CUSTOMER_COLUMNS);

    const vda = normVda(vdaKey);
    let count = 0;
    for (const row of rows) {
      const sm = normSalesman(row[col] ?? "");
      if (sm) {
        this.addCode(vda, sm);
        count++;
      }
      if (custCol) {
        const cust = normCustomer(row[custCol] ?? "");
        if (cust) this.addCustomer(vda, cust);
      }
    }

    console.info(
      `[VdaAosBill] ${vda} ← ${count} rows${custCol ? `, ${this.customersByVda.get(vda)?.size ?? 0} customers` : ""} from ${csvPath}`
    );
    return count > 0;
  }

  private addCustomer(vda: string, customerCode: string) {
    if (!this.customersByVda.has(vda)) {
      this.customersByVda.set(vda, new Set());
    }
    this.customersByVda.get(vda)!.add(customerCode);
  }

  /** รหัสลูกค้า (customercode, lowercased) ของ VDA — ใช้กรอง sold_history รายร้าน */
  getCustomerCodesForVda(vdaCode: string): string[] {
    const set = this.customersByVda.get(normVda(vdaCode));
    return set ? [...set] : [];
  }

  hasCustomers(): boolean {
    return this.customersByVda.size > 0;
  }

  /** fallback: map vda -> customercode จาก env VDA_CUSTOMER_MAP
   *  รูปแบบ: "vda1:3231847,vda2:5042814,..." (หลายรหัสคั่นด้วย |) */
  loadCustomerEnvFallback() {
    const raw = process.env.VDA_CUSTOMER_MAP?.trim();
    if (!raw) return;
    for (const part of raw.split(",")) {
      const [vda, codes] = part.split(":").map((s) => s.trim());
      if (!vda || !codes) continue;
      for (const c of codes.split("|")) {
        const cc = normCustomer(c);
        if (cc) this.addCustomer(normVda(vda), cc);
      }
    }
    console.info(
      `[VdaAosBill] Loaded customercodes for ${this.customersByVda.size} VDA(s) from VDA_CUSTOMER_MAP`
    );
  }

  private addCode(vda: string, salesmanCode: string) {
    if (!this.byVda.has(vda)) this.byVda.set(vda, new Map());
    const bucket = this.byVda.get(vda)!;
    bucket.set(salesmanCode, (bucket.get(salesmanCode) ?? 0) + 1);

    if (!this.bySalesman.has(salesmanCode)) {
      this.bySalesman.set(salesmanCode, new Set());
    }
    this.bySalesman.get(salesmanCode)!.add(vda);
  }

  listVdaCodes(): string[] {
    return [...this.byVda.keys()].sort();
  }

  getSalesmanCodesForVda(vdaCode: string): string[] {
    const bucket = this.byVda.get(normVda(vdaCode));
    if (!bucket) return [];
    return [...bucket.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code);
  }

  getPrimarySalesmanForVda(vdaCode: string): string | null {
    return this.getSalesmanCodesForVda(vdaCode)[0] ?? null;
  }

  getVdasForSalesman(salesmanCode: string): string[] {
    const set = this.bySalesman.get(normSalesman(salesmanCode));
    if (!set) return [];
    return [...set].sort();
  }
}

let registry: VdaAosBillRegistry | null = null;

export function getVdaKeys() {
  const raw = process.env.VDA_CODES?.trim();
  if (!raw) return [...VDA_KEYS];
  return raw.split(",").map((s) => normVda(s)).filter(Boolean);
}

export function getVdaAosBillRegistry(): VdaAosBillRegistry {
  if (!registry) reloadVdaAosBillRegistry();
  return registry!;
}

export function reloadVdaAosBillRegistry(): void {
  registry = new VdaAosBillRegistry();

  for (const vda of getVdaKeys()) {
    registry.loadCsv(vda, getVdaAosCsvPath(vda));
  }

  if (!registry.isLoaded) {
    registry.loadEnvFallback();
  }
  // ถ้า CSV ไม่มี customercode (เช่น vda_aos_bill ยังไม่ถูก export เป็น CSV)
  // ใช้ env VDA_CUSTOMER_MAP เพื่อกรองยอดขายรายวันรายร้านได้ทันที
  if (!registry.hasCustomers()) {
    registry.loadCustomerEnvFallback();
  }
}

export function isVdaStoreCode(code: string): boolean {
  return /^vda\d+$/i.test(code.trim());
}
