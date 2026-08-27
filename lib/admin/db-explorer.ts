import { Prisma } from "@prisma/client";

/**
 * ทะเบียนตารางในฐานข้อมูลของแอป สำหรับหน้าแอดมิน "ดูข้อมูลดิบ"
 *
 * ครึ่งหนึ่งเขียนมือ (ป้ายชื่อไทย · การจัดกลุ่ม · สิ่งที่ห้ามส่งออก) อีกครึ่งอ่านจาก
 * Prisma.dmmf ตอน runtime (รายชื่อคอลัมน์ + ชนิด) — เพิ่มคอลัมน์ใน schema แล้วหน้าเว็บ
 * เห็นเองโดยไม่ต้องมาแก้ไฟล์นี้ แต่คอลัมน์ที่ "ห้ามหลุด" ยังต้องผ่านการตัดสินใจของคนอยู่
 *
 * กติกาความปลอดภัย 2 ชั้น:
 *   1) redact รายตาราง — ตอนนี้มีตัวเดียวทั้ง schema คือ StoreAccount.passwordHash
 *   2) GLOBAL_REDACT_PATTERN — ใช้กับทุก model เสมอ เผื่อวันหน้ามีใครเพิ่มคอลัมน์
 *      อย่าง resetToken แล้วลืมมาขึ้นทะเบียนตรงนี้ ของลับจะไม่หลุดไปก่อน
 */

export type DbTableGroup =
  | "ออเดอร์ & PO"
  | "ร้านค้า & สินค้า"
  | "ตั้งค่า & ทะเบียน"
  | "แจ้งเตือน";

export type DbScalarKind = "String" | "Int" | "Float" | "Boolean" | "DateTime";

export interface DbDerivedField {
  name: string;
  label: string;
  /** คอลัมน์ต้นทางที่ต้องดึงมาคำนวณ แล้วต้องลบทิ้งก่อนส่งออก */
  from: string;
  kind: "hasValue";
}

export interface DbTableDef {
  model: string;
  /** ชื่อ delegate บน prisma client (camelCase ของ model) */
  delegate: string;
  label: string;
  group: DbTableGroup;
  redact: string[];
  /**
   * คอลัมน์ที่ชื่อเข้าข่ายความลับตาม GLOBAL_REDACT_PATTERN แต่คนยืนยันแล้วว่าปลอดภัย
   *
   * ตาข่ายกันของลับหลุดต้องกว้างไว้ก่อน แต่ความกว้างมีราคา: `mustSetPassword` เป็นแค่
   * boolean ว่า "ต้องตั้งรหัสผ่านใหม่ไหม" ซึ่งแอดมินต้องใช้จริง ๆ ตอนไล่ปัญหาบัญชีร้าน
   * การยกเว้นต้องเป็นการตัดสินใจของคนทีละคอลัมน์ ไม่ใช่ไปแก้ pattern ให้หลวมลง
   */
  alwaysShow?: string[];
  derived?: DbDerivedField[];
  defaultSort: { field: string; dir: "asc" | "desc" };
  /**
   * คอลัมน์ปิดท้ายการเรียงให้เป็น total order
   *
   * ไม่ใช่เรื่องความสวยงาม: SQLite LIMIT/OFFSET ที่เรียงด้วยคอลัมน์ค่าซ้ำได้
   * (updatedAt, createdAt) คืนแถวซ้ำหรือข้ามแถวระหว่างหน้าได้จริง และ StockItem
   * ไม่มี id เลย (@@id([storeId, skuId]))
   */
  tieBreak: string[];
  /** ไม่ระบุ = ใช้ String scalar 8 ตัวแรกที่มองเห็นได้ */
  searchFields?: string[];
}

export const GLOBAL_REDACT_PATTERN =
  /password|passwd|hash|secret|token|salt|apikey|api_key|credential|privatekey/i;

const MAX_AUTO_SEARCH_FIELDS = 8;

export const DB_TABLES: DbTableDef[] = [
  {
    model: "Order",
    delegate: "order",
    label: "ออเดอร์",
    group: "ออเดอร์ & PO",
    redact: [],
    defaultSort: { field: "createdAt", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "OrderItem",
    delegate: "orderItem",
    label: "รายการในออเดอร์",
    group: "ออเดอร์ & PO",
    redact: [],
    defaultSort: { field: "id", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "PurchaseOrder",
    delegate: "purchaseOrder",
    label: "ใบสั่งซื้อ (PO)",
    group: "ออเดอร์ & PO",
    redact: [],
    defaultSort: { field: "issuedAt", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "PoSequence",
    delegate: "poSequence",
    label: "เลขรันนิ่งของ PO",
    group: "ออเดอร์ & PO",
    redact: [],
    defaultSort: { field: "bucket", dir: "asc" },
    tieBreak: ["bucket"],
  },
  {
    model: "Store",
    delegate: "store",
    label: "ร้านค้า",
    group: "ร้านค้า & สินค้า",
    redact: [],
    defaultSort: { field: "code", dir: "asc" },
    tieBreak: ["id"],
  },
  {
    model: "Sku",
    delegate: "sku",
    label: "สินค้า",
    group: "ร้านค้า & สินค้า",
    redact: [],
    defaultSort: { field: "code", dir: "asc" },
    tieBreak: ["id"],
  },
  {
    model: "StockItem",
    delegate: "stockItem",
    label: "สต็อกต่อร้านต่อสินค้า",
    group: "ร้านค้า & สินค้า",
    redact: [],
    defaultSort: { field: "storeId", dir: "asc" },
    tieBreak: ["storeId", "skuId"],
  },
  {
    model: "StoreAccount",
    delegate: "storeAccount",
    label: "บัญชีร้านค้า",
    group: "ร้านค้า & สินค้า",
    // hash รหัสผ่าน — ตัวเดียวใน schema ที่ห้ามออกจากเซิร์ฟเวอร์
    redact: ["passwordHash"],
    // ติดตาข่ายเพราะชื่อมีคำว่า password แต่เป็นแค่ธง boolean ที่แอดมินต้องเห็น
    alwaysShow: ["mustSetPassword"],
    derived: [
      {
        name: "hasPassword",
        label: "ตั้งรหัสผ่านแล้ว",
        from: "passwordHash",
        kind: "hasValue",
      },
    ],
    defaultSort: { field: "createdAt", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "SalesRep",
    delegate: "salesRep",
    label: "พนักงานขาย",
    group: "ร้านค้า & สินค้า",
    redact: [],
    defaultSort: { field: "email", dir: "asc" },
    tieBreak: ["id"],
  },
  {
    model: "VdaWarehouse",
    delegate: "vdaWarehouse",
    label: "ทะเบียนคลัง VDA",
    group: "ตั้งค่า & ทะเบียน",
    redact: [],
    defaultSort: { field: "code", dir: "asc" },
    tieBreak: ["code"],
  },
  {
    model: "Admin",
    delegate: "admin",
    label: "ผู้ดูแลระบบ",
    group: "ตั้งค่า & ทะเบียน",
    redact: [],
    defaultSort: { field: "email", dir: "asc" },
    tieBreak: ["email"],
  },
  {
    model: "AllowedSalesCode",
    delegate: "allowedSalesCode",
    label: "รหัสเซลล์ที่อนุญาต",
    group: "ตั้งค่า & ทะเบียน",
    redact: [],
    defaultSort: { field: "code", dir: "asc" },
    tieBreak: ["code"],
  },
  {
    model: "StoreGroupThreshold",
    delegate: "storeGroupThreshold",
    label: "MIN/MAX ระดับกลุ่มสินค้า",
    group: "ตั้งค่า & ทะเบียน",
    redact: [],
    defaultSort: { field: "updatedAt", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "StoreSkuBlock",
    delegate: "storeSkuBlock",
    label: "รายการหยุดสั่ง",
    group: "ตั้งค่า & ทะเบียน",
    redact: [],
    defaultSort: { field: "createdAt", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "PromoTier",
    delegate: "promoTier",
    label: "ขั้นโปรโมชั่น (ในระบบ)",
    group: "ตั้งค่า & ทะเบียน",
    redact: [],
    defaultSort: { field: "sortOrder", dir: "asc" },
    tieBreak: ["id"],
  },
  {
    model: "StoreNotification",
    delegate: "storeNotification",
    label: "แจ้งเตือนถึงร้านค้า",
    group: "แจ้งเตือน",
    redact: [],
    defaultSort: { field: "createdAt", dir: "desc" },
    tieBreak: ["id"],
  },
  {
    model: "SalesNotification",
    delegate: "salesNotification",
    label: "แจ้งเตือนถึงเซลล์",
    group: "แจ้งเตือน",
    redact: [],
    defaultSort: { field: "createdAt", dir: "desc" },
    tieBreak: ["id"],
  },
];

export interface DbColumn {
  name: string;
  kind: DbScalarKind;
  nullable: boolean;
  /** คอลัมน์คำนวณ (ไม่มีจริงในตาราง) — เรียง/ค้นไม่ได้ */
  derived?: boolean;
  label?: string;
}

export function findDbTable(model: string): DbTableDef | null {
  return DB_TABLES.find((t) => t.model === model) ?? null;
}

function modelFields(model: string) {
  const dmmfModel = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!dmmfModel) return [];
  // kind === "object" คือความสัมพันธ์ ต้อง join เพิ่ม ไม่เอามาแสดง
  // แต่ FK ที่เป็น scalar (storeId, skuId, ...) เป็น "scalar" จึงยังได้ติดมาด้วย
  return dmmfModel.fields.filter((f) => f.kind === "scalar" && !f.isList);
}

/** คอลัมน์ที่ถูกซ่อน — UI เอาไปแสดงว่ามีอยู่แต่อ่านไม่ได้ ดีกว่าหายไปเฉย ๆ */
export function redactedFieldsFor(def: DbTableDef): string[] {
  const allowed = new Set(def.alwaysShow ?? []);
  return modelFields(def.model)
    .map((f) => f.name)
    .filter(
      (n) =>
        def.redact.includes(n) ||
        (GLOBAL_REDACT_PATTERN.test(n) && !allowed.has(n))
    );
}

export function visibleFieldsFor(def: DbTableDef): DbColumn[] {
  const hidden = new Set(redactedFieldsFor(def));
  const cols: DbColumn[] = modelFields(def.model)
    .filter((f) => !hidden.has(f.name))
    .map((f) => ({
      name: f.name,
      kind: f.type as DbScalarKind,
      nullable: !f.isRequired,
    }));

  for (const d of def.derived ?? []) {
    cols.push({ name: d.name, kind: "Boolean", nullable: false, derived: true, label: d.label });
  }
  return cols;
}

export function isSortableField(def: DbTableDef, field: string): boolean {
  return visibleFieldsFor(def).some((c) => c.name === field && !c.derived);
}

export function buildOrderBy(
  def: DbTableDef,
  sort: string | undefined,
  dir: "asc" | "desc"
): Record<string, "asc" | "desc">[] {
  const primary =
    sort && isSortableField(def, sort) ? sort : def.defaultSort.field;
  const primaryDir = sort && isSortableField(def, sort) ? dir : def.defaultSort.dir;

  const order: Record<string, "asc" | "desc">[] = [{ [primary]: primaryDir }];
  for (const f of def.tieBreak) {
    if (f !== primary) order.push({ [f]: "asc" });
  }
  return order;
}

export function searchableFieldsFor(def: DbTableDef): string[] {
  const cols = visibleFieldsFor(def).filter((c) => !c.derived && c.kind === "String");
  if (def.searchFields) {
    const allowed = new Set(cols.map((c) => c.name));
    return def.searchFields.filter((f) => allowed.has(f));
  }
  return cols.slice(0, MAX_AUTO_SEARCH_FIELDS).map((c) => c.name);
}

/**
 * where สำหรับช่องค้นหา
 *
 * ค้นเฉพาะคอลัมน์ String — `contains` บน Int/DateTime โยน error ใน Prisma
 * และ **ห้ามใส่ mode: "insensitive"** เพราะ connector SQLite ไม่รองรับ
 * (LIKE ของ SQLite ไม่สนตัวพิมพ์กับ ASCII อยู่แล้ว ส่วนภาษาไทยไม่มีตัวพิมพ์เล็กใหญ่)
 */
export function buildWhere(
  def: DbTableDef,
  q: string | undefined
): { OR: Record<string, { contains: string }>[] } | undefined {
  const needle = q?.trim();
  if (!needle) return undefined;
  const fields = searchableFieldsFor(def);
  if (fields.length === 0) return undefined;
  return { OR: fields.map((f) => ({ [f]: { contains: needle } })) };
}

/** คอลัมน์ที่ต้องดึงจริงจากฐานข้อมูล = ที่มองเห็นได้ + ต้นทางของคอลัมน์คำนวณ */
export function buildSelect(def: DbTableDef): Record<string, true> {
  const select: Record<string, true> = {};
  for (const c of visibleFieldsFor(def)) {
    if (!c.derived) select[c.name] = true;
  }
  for (const d of def.derived ?? []) select[d.from] = true;
  return select;
}

export type DbCell = string | number | boolean | null;

export function serializeRow(
  def: DbTableDef,
  row: Record<string, unknown>
): Record<string, DbCell> {
  const out: Record<string, DbCell> = {};

  for (const c of visibleFieldsFor(def)) {
    if (c.derived) continue;
    const v = row[c.name];
    if (v === null || v === undefined) out[c.name] = null;
    else if (v instanceof Date) out[c.name] = v.toISOString();
    else if (typeof v === "number" || typeof v === "boolean") out[c.name] = v;
    else out[c.name] = String(v);
  }

  for (const d of def.derived ?? []) {
    const src = row[d.from];
    out[d.name] = src !== null && src !== undefined && src !== "";
  }

  return out;
}
