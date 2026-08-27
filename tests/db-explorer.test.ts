import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  DB_TABLES,
  GLOBAL_REDACT_PATTERN,
  buildOrderBy,
  buildSelect,
  buildWhere,
  findDbTable,
  isSortableField,
  redactedFieldsFor,
  searchableFieldsFor,
  serializeRow,
  visibleFieldsFor,
} from "@/lib/admin/db-explorer";

/**
 * ทะเบียนตารางของหน้า "ดูข้อมูลดิบ"
 *
 * เทสต์ชุดนี้ทำหน้าที่เป็นสัญญาณเตือน schema drift ด้วย: เพิ่มคอลัมน์ที่ชื่อเข้าข่าย
 * ความลับ (resetToken, apiKey, ...) แล้วเทสต์จะยังผ่าน เพราะ GLOBAL_REDACT_PATTERN
 * ดักให้ แต่ถ้าเปลี่ยนชื่อคอลัมน์ที่ใช้เรียง/ค้น เทสต์จะฟ้องทันที
 *
 * ไม่ต่อฐานข้อมูลจริง — Prisma.dmmf เป็น object ธรรมดาที่อ่านได้เลย
 */

const modelNames = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));

function scalarFieldNames(model: string): Set<string> {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  return new Set((m?.fields ?? []).filter((f) => f.kind === "scalar").map((f) => f.name));
}

describe("ทะเบียน DB_TABLES ตรงกับ schema จริง", () => {
  it("ทุก model ที่ขึ้นทะเบียนมีอยู่จริงใน Prisma", () => {
    for (const def of DB_TABLES) {
      expect(modelNames.has(def.model), `ไม่มี model ${def.model}`).toBe(true);
    }
  });

  it("คอลัมน์ที่ใช้เรียงและตัดสินลำดับมีอยู่จริง", () => {
    for (const def of DB_TABLES) {
      const fields = scalarFieldNames(def.model);
      expect(fields.has(def.defaultSort.field), `${def.model}.${def.defaultSort.field}`).toBe(true);
      for (const f of def.tieBreak) {
        expect(fields.has(f), `${def.model}.${f}`).toBe(true);
      }
    }
  });

  it("ทุกตารางต้องมี tieBreak — ไม่งั้น LIMIT/OFFSET บน SQLite ทำแถวซ้ำ/ตกหล่นข้ามหน้า", () => {
    for (const def of DB_TABLES) {
      expect(def.tieBreak.length, def.model).toBeGreaterThan(0);
    }
  });

  it("คอลัมน์ต้นทางของค่าคำนวณมีอยู่จริง", () => {
    for (const def of DB_TABLES) {
      for (const d of def.derived ?? []) {
        expect(scalarFieldNames(def.model).has(d.from), `${def.model}.${d.from}`).toBe(true);
      }
    }
  });

  it("ค้นหาได้เฉพาะคอลัมน์ String (contains บน Int/DateTime พังใน Prisma)", () => {
    for (const def of DB_TABLES) {
      const cols = visibleFieldsFor(def);
      for (const f of searchableFieldsFor(def)) {
        expect(cols.find((c) => c.name === f)?.kind, `${def.model}.${f}`).toBe("String");
      }
    }
  });
});

describe("การซ่อนความลับ", () => {
  it("ไม่มีคอลัมน์จริงที่ชื่อเข้าข่ายความลับหลุดออกมาสักตาราง", () => {
    for (const def of DB_TABLES) {
      for (const c of visibleFieldsFor(def)) {
        if (c.derived) continue; // ค่าคำนวณ ไม่ใช่คอลัมน์ในตาราง — คุมด้วยเทสต์ถัดไป
        if ((def.alwaysShow ?? []).includes(c.name)) continue; // คนยืนยันแล้วว่าปลอดภัย
        expect(GLOBAL_REDACT_PATTERN.test(c.name), `${def.model}.${c.name}`).toBe(false);
      }
    }
  });

  it("คอลัมน์ที่ยกเว้นไว้ต้องมีอยู่จริงและไม่ใช่ตัวที่ redact ไว้พร้อมกัน", () => {
    // ยกเว้นผิดตัว = ของลับหลุด จึงต้องพิสูจน์ว่าตัวที่ยกเว้นมีจริงและไม่ขัดกับ redact
    for (const def of DB_TABLES) {
      for (const name of def.alwaysShow ?? []) {
        expect(scalarFieldNames(def.model).has(name), `${def.model}.${name}`).toBe(true);
        expect(def.redact.includes(name), `${def.model}.${name}`).toBe(false);
      }
    }
  });

  it("mustSetPassword ติดตาข่ายเพราะชื่อ แต่ถูกยกเว้นไว้ให้เห็นได้", () => {
    const def = findDbTable("StoreAccount")!;
    expect(GLOBAL_REDACT_PATTERN.test("mustSetPassword")).toBe(true);
    expect(visibleFieldsFor(def).map((c) => c.name)).toContain("mustSetPassword");
    expect(redactedFieldsFor(def)).not.toContain("mustSetPassword");
  });

  it("ค่าคำนวณต้องเป็น hasValue เท่านั้น — คืนได้แค่ true/false จึงเอาค่าจริงออกไปไม่ได้", () => {
    // ค่าคำนวณเป็นทางเดียวที่คอลัมน์ซึ่งถูกซ่อนจะโผล่ออกไปได้ ถ้าวันหน้ามีคนเพิ่มชนิดใหม่
    // ที่คืนค่าดิบ (เช่น "prefix" หรือ "mask") เทสต์นี้จะฟ้องก่อนที่ของลับจะหลุด
    for (const def of DB_TABLES) {
      for (const d of def.derived ?? []) {
        expect(d.kind, `${def.model}.${d.name}`).toBe("hasValue");
      }
    }
  });

  it("StoreAccount ไม่ส่ง passwordHash แต่บอกได้ว่าตั้งรหัสผ่านแล้วหรือยัง", () => {
    const def = findDbTable("StoreAccount")!;
    const names = visibleFieldsFor(def).map((c) => c.name);
    expect(names).not.toContain("passwordHash");
    expect(names).toContain("hasPassword");
    expect(redactedFieldsFor(def)).toContain("passwordHash");
    expect(isSortableField(def, "passwordHash")).toBe(false);
  });

  it("select ที่ส่งให้ Prisma ดึง passwordHash มาเฉพาะเพื่อคำนวณ แล้วต้องไม่ติดไปกับผลลัพธ์", () => {
    const def = findDbTable("StoreAccount")!;
    expect(buildSelect(def).passwordHash).toBe(true);

    const row = serializeRow(def, {
      id: "a",
      email: "x@y.z",
      vdaCode: "vda1",
      status: "approved",
      passwordHash: "$2b$10$secretsecret",
      mustSetPassword: false,
      canManageMinMax: false,
      resetRequestedAt: null,
      approvedBy: "",
      createdAt: new Date("2026-08-27T00:00:00Z"),
      updatedAt: new Date("2026-08-27T00:00:00Z"),
    });
    expect(row.hasPassword).toBe(true);
    expect(JSON.stringify(row)).not.toContain("secretsecret");
    expect("passwordHash" in row).toBe(false);
  });

  it("ยังไม่ตั้งรหัสผ่าน = hasPassword false", () => {
    const def = findDbTable("StoreAccount")!;
    expect(serializeRow(def, { passwordHash: null }).hasPassword).toBe(false);
  });
});

describe("เรียง / ค้น / แปลงค่า", () => {
  it("เรียงด้วยคอลัมน์ที่ไม่รู้จัก ถอยไปใช้ค่าตั้งต้น ไม่ส่งต่อให้ Prisma", () => {
    const def = findDbTable("Order")!;
    expect(buildOrderBy(def, "'; DROP TABLE", "asc")).toEqual([
      { createdAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("เรียงด้วยคอลัมน์จริงแล้วต่อท้ายด้วย tieBreak เสมอ", () => {
    const def = findDbTable("Order")!;
    expect(buildOrderBy(def, "status", "asc")).toEqual([
      { status: "asc" },
      { id: "asc" },
    ]);
  });

  it("เรียงด้วยคอลัมน์ที่เป็น tieBreak อยู่แล้ว ต้องไม่ซ้ำสองครั้ง", () => {
    const def = findDbTable("Order")!;
    expect(buildOrderBy(def, "id", "asc")).toEqual([{ id: "asc" }]);
  });

  it("StockItem ที่ไม่มี id ใช้คู่ storeId+skuId ปิดท้าย", () => {
    const def = findDbTable("StockItem")!;
    expect(buildOrderBy(def, undefined, "asc")).toEqual([
      { storeId: "asc" },
      { skuId: "asc" },
    ]);
  });

  it("คำค้นว่างไม่สร้าง where", () => {
    const def = findDbTable("Store")!;
    expect(buildWhere(def, "   ")).toBeUndefined();
    expect(buildWhere(def, undefined)).toBeUndefined();
  });

  it("คำค้นสร้าง OR เฉพาะคอลัมน์ String และไม่มี mode insensitive (SQLite ไม่รองรับ)", () => {
    const def = findDbTable("Store")!;
    const where = buildWhere(def, "vda1")!;
    expect(where.OR.length).toBeGreaterThan(0);
    expect(JSON.stringify(where)).not.toContain("insensitive");
    for (const clause of where.OR) {
      expect(Object.values(clause)[0]).toEqual({ contains: "vda1" });
    }
  });

  it("วันที่แปลงเป็น ISO และค่าว่างคงเป็น null ไม่ใช่สตริงว่าง", () => {
    const def = findDbTable("Order")!;
    const row = serializeRow(def, {
      id: "o1",
      storeId: "s1",
      status: "pending_approval",
      rejectReason: null,
      createdAt: new Date("2026-08-27T03:04:05.000Z"),
      approvedAt: null,
      decidedAt: null,
      decidedBy: "",
    });
    expect(row.createdAt).toBe("2026-08-27T03:04:05.000Z");
    expect(row.approvedAt).toBeNull();
    expect(row.rejectReason).toBeNull();
    expect(row.decidedBy).toBe("");
  });
});
