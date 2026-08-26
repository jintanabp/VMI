import { prisma } from "@/lib/prisma";
import { normalizeStoreKey } from "./store-key";

/**
 * ทะเบียนคลัง VDA — "vda1 คือลูกค้ารหัสไหน"
 *
 * ความรู้ชิ้นนี้ไม่มีไฟล์ไหนบอกได้ ชื่อใน dim_customer เป็นชื่อบริษัท (พีเอสแอนด์เอสกรุ๊ป,
 * บิ๊กบิซพลัส, ...) ไม่มีคำว่า VDA ให้จับเลยสักรหัส เดิมจึงอยู่ใน VDA_CUSTOMER_MAP
 * ซึ่งแปลว่าเปิดคลังใหม่ทีต้องแก้ .env บนเซิร์ฟเวอร์แล้ว restart
 *
 * ตอนนี้อยู่ในฐานข้อมูล แก้จากหน้า /admin/vda ได้ ส่วน env เหลือหน้าที่เดียวคือ seed
 * ตอนตารางยังว่าง (deploy ครั้งแรก) และเป็นตาข่ายรับตอน DB ยังอ่านไม่ได้
 *
 * รูปแบบ cache ยืมมาจาก lib/auth/admin-registry: ชั้น fabric อ่านแบบ sync ไม่ได้
 * await ระหว่างโหลด CSV จึงต้องมี snapshot ที่ refresh ตอน boot และหลังแอดมินกดบันทึก
 */

export interface VdaWarehouseEntry {
  code: string;
  customerCodes: string[];
  label: string;
  active: boolean;
  /** มาจากฐานข้อมูลหรือจาก .env — หน้าแอดมินใช้บอกว่าแถวไหนแก้ได้ */
  source: "db" | "env";
}

function normVda(code: string): string {
  return normalizeStoreKey(code);
}

function normCustomer(code: string): string {
  return code.trim().toLowerCase();
}

/** "vda1:3231847,vda2:5042814|5042815" — หลายรหัสลูกค้าคั่นด้วย | */
export function parseVdaCustomerMapFromEnv(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const raw = process.env.VDA_CUSTOMER_MAP?.trim();
  if (!raw) return out;

  for (const part of raw.split(",")) {
    const [vda, codes] = part.split(":").map((s) => s.trim());
    if (!vda || !codes) continue;
    const list = codes.split("|").map(normCustomer).filter(Boolean);
    if (list.length > 0) out.set(normVda(vda), list);
  }
  return out;
}

/**
 * รวม DB กับ env — แถวใน DB ชนะ env เสมอเมื่อรหัสคลังซ้ำกัน
 *
 * env ที่เหลือค้างอยู่จึงไม่แอบทับสิ่งที่แอดมินเพิ่งแก้จากหน้าเว็บ ซึ่งเป็นกับดัก
 * เดียวกับที่ทำให้ C4 พังมาแล้ว (ค่าใน .env ชนะทุกอย่างและไม่มีใครเห็นว่ามันชนะอยู่)
 */
export function mergeVdaWarehouses(
  dbRows: {
    code: string;
    customerCodes: string;
    label: string;
    active: boolean;
  }[]
): VdaWarehouseEntry[] {
  const merged = new Map<string, VdaWarehouseEntry>();

  for (const [code, customerCodes] of parseVdaCustomerMapFromEnv()) {
    merged.set(code, {
      code,
      customerCodes,
      label: "",
      active: true,
      source: "env",
    });
  }

  for (const row of dbRows) {
    const code = normVda(row.code);
    if (!code) continue;
    merged.set(code, {
      code,
      customerCodes: row.customerCodes
        .split("|")
        .map(normCustomer)
        .filter(Boolean),
      label: row.label ?? "",
      active: row.active,
      source: "db",
    });
  }

  return [...merged.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true })
  );
}

let cache: VdaWarehouseEntry[] | null = null;

export async function refreshVdaWarehouseCache(): Promise<VdaWarehouseEntry[]> {
  try {
    const rows = await prisma.vdaWarehouse.findMany();
    cache = mergeVdaWarehouses(rows);
  } catch (err) {
    // DB ยังไม่พร้อม (migrate ยังไม่จบ) — ใช้ env ไปก่อน ดีกว่าไม่มีคลังเลยทั้งระบบ
    console.error("[VdaWarehouse] อ่านจากฐานข้อมูลไม่ได้ ใช้ค่าจาก .env แทน:", err);
    cache = mergeVdaWarehouses([]);
  }
  return cache;
}

/** snapshot ล่าสุด — ยังไม่เคย refresh ก็ถอยไปใช้ env (ไม่ยิง DB เพราะตรงนี้ sync) */
export function listVdaWarehouses(): VdaWarehouseEntry[] {
  return cache ?? mergeVdaWarehouses([]);
}

export function listActiveVdaCodes(): string[] {
  return listVdaWarehouses()
    .filter((w) => w.active)
    .map((w) => w.code);
}

export async function listVdaWarehousesAsync(): Promise<VdaWarehouseEntry[]> {
  return cache ?? (await refreshVdaWarehouseCache());
}

/**
 * ย้ายค่าจาก .env เข้าฐานข้อมูลตอน boot ถ้าตารางยังว่าง
 *
 * ทำครั้งเดียวโดยตั้งใจ: หลังจากนี้แอดมินแก้ผ่านหน้าเว็บได้ และการ deploy ครั้งถัดไป
 * จะไม่ย้อนค่ากลับไปเป็นของใน .env อีก (ถ้า seed ทุกรอบ การลบคลังจากหน้าเว็บจะไม่มีผล)
 */
export async function bootstrapVdaWarehousesFromEnv(): Promise<number> {
  const fromEnv = parseVdaCustomerMapFromEnv();
  if (fromEnv.size === 0) return 0;

  const existing = await prisma.vdaWarehouse.count();
  if (existing > 0) {
    await refreshVdaWarehouseCache();
    return 0;
  }

  for (const [code, customerCodes] of fromEnv) {
    await prisma.vdaWarehouse.create({
      data: { code, customerCodes: customerCodes.join("|") },
    });
  }
  console.info(
    `[VdaWarehouse] ย้าย ${fromEnv.size} คลังจาก VDA_CUSTOMER_MAP เข้าฐานข้อมูลแล้ว — ` +
      `จากนี้แก้ได้ที่หน้า /admin/vda ไม่ต้องแก้ .env`
  );
  await refreshVdaWarehouseCache();
  return fromEnv.size;
}

export async function saveVdaWarehouses(
  entries: { code: string; customerCodes: string[]; label?: string; active?: boolean }[]
): Promise<VdaWarehouseEntry[]> {
  const codes = entries.map((e) => normVda(e.code)).filter(Boolean);

  await prisma.$transaction([
    prisma.vdaWarehouse.deleteMany({ where: { code: { notIn: codes } } }),
    ...entries.map((e) => {
      const code = normVda(e.code);
      const data = {
        customerCodes: e.customerCodes.map(normCustomer).filter(Boolean).join("|"),
        label: e.label?.trim() ?? "",
        active: e.active ?? true,
      };
      return prisma.vdaWarehouse.upsert({
        where: { code },
        create: { code, ...data },
        update: data,
      });
    }),
  ]);

  return refreshVdaWarehouseCache();
}
