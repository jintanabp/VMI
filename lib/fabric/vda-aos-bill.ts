import { normalizeStoreKey } from "./store-key";
import { getCrossTargetRegistry } from "./cross-target";
import { fabricStockReady, getStockCoverDirectory } from "./stock-cover";
import { getStockFilterConfig } from "./stock-filter-config";
import { listVdaWarehouses } from "./vda-warehouse-registry";

/**
 * ทะเบียน VDA → พนักงานขาย / รหัสลูกค้า
 *
 * ทะเบียนนี้คือแหล่งสิทธิ์เดียวของออเดอร์/PO/โปรฝั่ง VDA (ดู lib/orders/access.ts)
 *
 * **รหัสลูกค้า** มาจากทะเบียนคลังในฐานข้อมูล (แก้ที่หน้า /admin/vda) — ตัวนี้คือนิยามว่า
 * คลัง vdaN คือบัญชีลูกค้าใบไหน ไม่มีไฟล์ไหนบอกได้ ต้องมีคนกำหนด แต่ไม่ควรต้องแก้ .env
 * แล้ว restart ทุกครั้งที่เปิดคลังใหม่ · VDA_CUSTOMER_MAP เหลือหน้าที่ seed ตอนตารางว่าง
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
   * ต้องเรียกหลัง loadCustomerMap() เพราะต้องมีรหัสลูกค้าก่อน
   */
  loadSalesmenFromTarget(): number {
    let target: ReturnType<typeof getCrossTargetRegistry>;
    try {
      target = getCrossTargetRegistry();
    } catch (err) {
      // ล้มตรงนี้ = ไม่มีทะเบียนสิทธิ์ VDA เลย ต้องปล่อยให้ตกไปใช้ env fallback
      console.error("[VdaAosBill] อ่าน cross_target ไม่ได้ — ใช้ VDA_SALESMAN_MAP แทน:", err);
      return 0;
    }
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
    const filled: string[] = [];
    for (const [vda, sm] of parseEnvMap(raw)) {
      if (this.byVda.has(vda)) continue; // จับคู่จากไฟล์ได้แล้ว ไม่ต้องทับ
      this.addCode(vda, sm);
      filled.push(`${vda}→${sm}`);
    }
    // เงียบเมื่อไม่ได้เติมอะไร — ไม่งั้น log จะขึ้นคำว่า fallback ทุกครั้งแม้จับคู่จากไฟล์
    // ได้ครบแล้ว คนที่ไล่ปัญหาบนเซิร์ฟเวอร์จะเข้าใจผิดว่ากำลังใช้ค่าที่กรอกมืออยู่
    if (filled.length > 0) {
      console.info(
        `[VdaAosBill] ⚠ ใช้ VDA_SALESMAN_MAP (fallback) กับ ${filled.length} VDA ` +
          `เพราะจับคู่จาก cross_target ไม่ได้: ${filled.join(", ")}`
      );
    }
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

  /**
   * map vda -> customercode จากทะเบียนคลัง (ฐานข้อมูล + .env)
   *
   * อ่านจาก snapshot ที่ refresh ตอน boot และหลังแอดมินกดบันทึก — ชั้นนี้เป็น sync
   * ทั้งเส้น (โหลด CSV) จึง await ตรงนี้ไม่ได้
   */
  loadCustomerMap() {
    const warehouses = listVdaWarehouses().filter((w) => w.active);
    for (const w of warehouses) {
      for (const cc of w.customerCodes) this.addCustomer(normVda(w.code), cc);
    }
    const fromDb = warehouses.filter((w) => w.source === "db").length;
    console.info(
      `[VdaAosBill] รหัสลูกค้าของ ${this.customersByVda.size} คลัง ` +
        `(จากฐานข้อมูล ${fromDb} · จาก .env ${warehouses.length - fromDb})`
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

  /**
   * เซลล์ทุกคนที่ดูแลคลัง VDA ในระบบ ไม่จำกัดว่าคลังไหน
   *
   * ใช้กับแท็บ "ควรมีขาย": เป้าขายเข้าไปที่เซลล์ผู้ดูแลของแต่ละคลัง แต่ของที่เซลล์
   * คลังอื่นมีเป้า ร้านนี้ก็อยากสั่งได้เหมือนกัน — จำกัดแค่เซลล์ผู้ดูแลคลังตัวเอง
   * ทำให้ vda1 (S091) ไม่มีวันเห็นของที่ S361 หรือ S594 ถืออยู่
   */
  listAllSalesmanCodes(): string[] {
    return [...this.bySalesman.keys()].sort();
  }
}

let registry: VdaAosBillRegistry | null = null;

/**
 * คลังที่ระบบต้องรู้จัก — รวมจากข้อมูลจริง ไม่ใช่รายชื่อตายตัว
 *
 * เดิมเป็นค่าคงที่ vda1-vda5 ในโค้ด แล้วให้ VDA_CODES ทับ ผลคือเปิดคลังที่ 6 ทีต้อง
 * ไปแก้ .env ของทุกเครื่อง ไม่งั้นคลังใหม่จะไม่มีใครดึงไฟล์ให้และไม่โผล่ที่ไหนเลย
 *
 * ตอนนี้เอาสามแหล่งมารวมกัน: ทะเบียนคลังที่แอดมินตั้งไว้ · คลังที่โผล่ในไฟล์สต็อกจริง ·
 * รายชื่อตั้งต้นในโค้ด — คลังใหม่จึงถูกนับทันทีที่มีข้อมูลของมันเข้ามา หรือทันทีที่
 * แอดมินเพิ่มในหน้าเว็บ อย่างใดอย่างหนึ่งก็พอ
 *
 * VDA_CODES ยัง override ได้ (ระบุแล้วใช้ตามนั้นเป๊ะ) เผื่อวันที่ต้องตัดคลังออกชั่วคราว
 */
export function getVdaKeys() {
  const raw = process.env.VDA_CODES?.trim();
  if (raw) return raw.split(",").map((s) => normVda(s)).filter(Boolean);

  const codes = new Set<string>(VDA_KEYS);
  for (const w of listVdaWarehouses()) {
    if (w.active) codes.add(normVda(w.code));
  }
  if (fabricStockReady()) {
    for (const source of getStockCoverDirectory().resolveSources(
      getStockFilterConfig()
    )) {
      const code = normVda(source);
      if (code) codes.add(code);
    }
  }
  return [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function getVdaAosBillRegistry(): VdaAosBillRegistry {
  if (!registry) reloadVdaAosBillRegistry();
  return registry!;
}

export function reloadVdaAosBillRegistry(): void {
  registry = new VdaAosBillRegistry();
  // รหัสลูกค้าก่อน — เป็นกุญแจที่ใช้ไปหารหัสเซลล์ต่อ
  registry.loadCustomerMap();
  registry.loadSalesmenFromTarget();
  registry.loadEnvFallback();
}

export function isVdaStoreCode(code: string): boolean {
  return /^vda\d+$/i.test(code.trim());
}
