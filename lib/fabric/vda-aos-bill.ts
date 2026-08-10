import { normalizeStoreKey } from "./store-key";
import { getCrossTargetRegistry } from "./cross-target";

/**
 * ทะเบียน VDA → พนักงานขาย / รหัสลูกค้า
 *
 * ทะเบียนนี้คือแหล่งสิทธิ์เดียวของออเดอร์/PO/โปรฝั่ง VDA (ดู lib/orders/access.ts)
 *
 * **รหัสลูกค้า** มาจาก VDA_CUSTOMER_MAP ใน .env — ตัวนี้คือนิยามว่าคลัง vdaN คือ
 * บัญชีลูกค้าใบไหน ไม่มีไฟล์ไหนบอกได้ ต้องตั้งเอง (เพิ่ม VDA ใหม่ = แก้บรรทัดนี้)
 *
 * **รหัสเซลล์** หามาจาก cross_target_current_month โดยจับ WarehouseCode ↔ รหัสลูกค้า
 * ไม่ได้กรอกมืออีกแล้ว เพราะการกรอกมือเคยผิด: เซลล์คนเดียวดูแลได้หลายคลัง
 * (S091 ดูแลทั้ง vda1 และ vda3) คนกรอกจึงไล่เติมรหัสไม่ซ้ำ 4 ตัวให้ 5 VDA แล้วเลื่อน
 * ผิดตำแหน่งกันหมด ทำให้เซลล์เห็นออเดอร์ของร้านอื่นโดยไม่มีใครรู้
 *
 * VDA_SALESMAN_MAP ยังอยู่แต่เป็น fallback เท่านั้น — ใช้ตอนที่ยังไม่มีไฟล์ในเครื่อง
 * (คอนเทนเนอร์ที่เพิ่ง deploy ก่อน sync รอบแรก) และใช้ override ได้ถ้าต้นทางผิด
 */
const VDA_KEYS = ["vda1", "vda2", "vda3", "vda4", "vda5"] as const;

function normVda(code: string): string {
  // ใช้ normalizer ตัวเดียวกับ sold-history — รองรับ "VDA_1" → "vda1" ด้วย (เดิม lowercase อย่างเดียว)
  return normalizeStoreKey(code);
}

function normSalesman(code: string): string {
  return code.trim().toUpperCase();
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

  /**
   * หารหัสเซลล์จาก cross_target โดยใช้รหัสลูกค้าของแต่ละ VDA เป็นตัวจับ
   * ต้องเรียกหลัง loadCustomerEnvFallback() เพราะต้องมีรหัสลูกค้าก่อน
   */
  loadSalesmenFromTarget(): number {
    const target = getCrossTargetRegistry();
    if (!target.isLoaded) return 0;

    let matched = 0;
    for (const [vda, customers] of this.customersByVda) {
      const codes = target.salesmenForCustomers([...customers]);
      if (codes.length === 0) continue;
      for (const sm of codes) this.addCode(vda, normSalesman(sm));
      matched++;
    }
    if (matched > 0) {
      console.info(
        `[VdaAosBill] จับคู่เซลล์ให้ ${matched} VDA จาก cross_target: ` +
          [...this.byVda]
            .map(([v, m]) => `${v}→${[...m.keys()].join("/")}`)
            .join(", ")
      );
    }
    return matched;
  }

  /** ใช้เมื่อยังไม่มีไฟล์ cross_target (deploy ใหม่ก่อน sync รอบแรก) หรือ override */
  loadEnvFallback() {
    const raw = process.env.VDA_SALESMAN_MAP?.trim();
    if (!raw) return;
    for (const [vda, sm] of parseEnvMap(raw)) {
      if (this.byVda.has(vda)) continue; // จับคู่จากไฟล์ได้แล้ว ไม่ต้องทับ
      this.addCode(vda, sm);
    }
    console.info(
      `[VdaAosBill] เติมจาก VDA_SALESMAN_MAP (fallback) — รวมเป็น ${this.byVda.size} VDA`
    );
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

  /** map vda -> customercode จาก env VDA_CUSTOMER_MAP
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
  // รหัสลูกค้าก่อน — เป็นกุญแจที่ใช้ไปหารหัสเซลล์ต่อ
  registry.loadCustomerEnvFallback();
  registry.loadSalesmenFromTarget();
  registry.loadEnvFallback();
}

export function isVdaStoreCode(code: string): boolean {
  return /^vda\d+$/i.test(code.trim());
}
