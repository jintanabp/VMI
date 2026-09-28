import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesSession } from "@/lib/auth/sales-session";

/**
 * แอดมินเอาอีเมลออกจากรหัสเซลล์ → คนที่ login ค้างอยู่ต้องเสียสิทธิ์ทันที ไม่ใช่รอ cookie หมดอายุ 7 วัน
 *
 * mock ตารางที่แอดมินกำหนด + master พนักงาน (ว่าง) — ตรวจแค่การตัดสินใจของ revalidateManualCodes
 */

let manualCodes: string[] | Error = [];

vi.mock("@/lib/auth/manual-salesman-assignments", () => ({
  getManualSalesmanCodes: async () => {
    if (manualCodes instanceof Error) throw manualCodes;
    return manualCodes;
  },
}));

vi.mock("@/lib/fabric/vda-aos-bill", () => ({
  getVdaAosBillRegistry: () => ({
    getVdasForSalesman: (code: string) => (code === "S555" ? ["vda4"] : []),
    isLoaded: true,
    listVdaCodes: () => ["vda4"],
    getSalesmanCodesForVda: () => ["S555"],
  }),
  getVdaKeys: () => [],
  isVdaStoreCode: () => true,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

/** creator = .env · admin = ตาราง Admin (ไม่รวม .env) */
let envAdmins = new Set<string>();
let dbAdmins = new Set<string>();

vi.mock("@/lib/auth/admin-registry", () => ({
  isCreatorEmail: (e: string) => envAdmins.has(e.toLowerCase()),
  isAdminEmail: (e: string) => envAdmins.has(e.toLowerCase()) || dbAdmins.has(e.toLowerCase()),
  isAdminEmailAsync: async (e: string) =>
    envAdmins.has(e.toLowerCase()) || dbAdmins.has(e.toLowerCase()),
  parseAdminEmailsFromEnv: () => [...envAdmins],
}));

const base: SalesSession = {
  email: "helper@sahapat.co.th",
  role: "sales",
  salesmanCode: "S091",
  scopeSalesmanCodes: ["S091"],
  manualCodes: ["S091"],
};

describe("revalidateManualCodes — สิทธิ์ตามการกำหนดของแอดมินตอนนี้ ไม่ใช่ตอน login", () => {
  let revalidate: typeof import("@/lib/auth/sales-session").revalidateManualCodes;

  beforeEach(async () => {
    envAdmins = new Set();
    dbAdmins = new Set();
    ({ revalidateManualCodes: revalidate } = await import("@/lib/auth/sales-session"));
  });

  it("รหัสยังตรงกับที่ติดมาใน session → ใช้ session เดิม", async () => {
    manualCodes = ["S091"];
    expect(await revalidate(base)).toBe(base);
  });

  it("แอดมินเอาอีเมลออก และไม่มีรหัสใน master แล้ว → ไม่มี session (ถูกพาไป login)", async () => {
    manualCodes = [];
    expect(await revalidate(base)).toBeNull();
  });

  it("ฐานข้อมูลอ่านไม่ได้ชั่วคราว → ใช้สิทธิ์เดิมไปก่อน ไม่เตะทุกคนออก", async () => {
    manualCodes = new Error("db down");
    expect(await revalidate(base)).toBe(base);
  });

  it("อีเมลที่ผูกกับรหัส → login ได้ในฐานะรหัสนั้น (ไม่ต้องมีใน master)", async () => {
    manualCodes = ["S777"];
    const { buildSalesSessionWithAccess } = await import("@/lib/auth/sales-session");
    const s = await buildSalesSessionWithAccess("ref@sahapat.co.th", "ผู้ใช้อ้างอิง");
    expect(s.role).toBe("sales");
    expect(s.salesmanCode).toBe("S777");
    expect(s.salesmanName).toBe("รหัส S777");
    expect(s.scopeSalesmanCodes).toEqual(["S777"]);
    expect(s.manualCodes).toEqual(["S777"]);
    expect(s.name).toBe("ผู้ใช้อ้างอิง");
  });

  it("ผูกหลายรหัส → เห็นทุกรหัส · รหัสหลัก = รหัสที่ดูแลคลัง", async () => {
    manualCodes = ["S777", "S555"];
    const { buildSalesSessionWithAccess } = await import("@/lib/auth/sales-session");
    const s = await buildSalesSessionWithAccess("multi@sahapat.co.th");
    expect(s.role).toBe("sales");
    expect(s.salesmanCode).toBe("S555");
    expect(s.scopeSalesmanCodes).toEqual(["S555", "S777"]);
  });

  it("cookie เก่าที่ออกจาก master (รหัสไม่ได้ผูกกับอีเมล) → ต้อง login ใหม่ ไม่ใช้สิทธิ์ตาม master ต่อ", async () => {
    manualCodes = [];
    const old = { ...base, manualCodes: undefined };
    expect(await revalidate(old)).toBeNull();
  });

  it("cookie ที่ขอบเขตกว้างกว่ารหัสที่ผูก (รหัส/อีเมลลูกทีมจาก master ติดมา) → ตัดเหลือเฉพาะที่ผูก", async () => {
    manualCodes = ["S091"];
    const wide: SalesSession = {
      ...base,
      scopeSalesmanCodes: ["S091", "S100"],
      scopeEmails: ["helper@sahapat.co.th", "teammate@sahapat.co.th"],
    };
    const next = await revalidate(wide);
    expect(next).not.toBe(wide);
    expect(next?.scopeSalesmanCodes).toEqual(["S091"]);
    expect(next?.scopeEmails).toEqual(["helper@sahapat.co.th"]);
  });

  it("cookie เก่าของ manager จาก master แต่ผูกรหัสไว้แล้ว → คำนวณใหม่เป็น sales ตามรหัสที่ผูก", async () => {
    manualCodes = ["S091"];
    const old: SalesSession = { ...base, role: "manager", scopeSalesmanCodes: ["S091", "S100"] };
    const next = await revalidate(old);
    expect(next?.role).toBe("sales");
    expect(next?.scopeSalesmanCodes).toEqual(["S091"]);
  });
});

describe("Creator / Admin — ระดับสิทธิ์หน้าตั้งค่า", () => {
  let mod: typeof import("@/lib/auth/sales-session");

  beforeEach(async () => {
    envAdmins = new Set();
    dbAdmins = new Set();
    manualCodes = [];
    mod = await import("@/lib/auth/sales-session");
  });

  it("อีเมลใน .env = creator (role admin)", async () => {
    envAdmins.add("dev@sahapat.co.th");
    const s = await mod.buildSalesSessionWithAccess("dev@sahapat.co.th");
    expect(s.role).toBe("admin");
    expect(s.adminAccess).toBe("creator");
  });

  it("admin ใน DB ที่ไม่มีรหัสเซลล์ → login ได้ role sales ขอบเขตว่าง ไม่ได้ role admin", async () => {
    dbAdmins.add("staff@sahapat.co.th");
    const s = await mod.buildSalesSessionWithAccess("staff@sahapat.co.th");
    expect(s.role).toBe("sales");
    expect(s.adminAccess).toBe("admin");
    expect(s.salesmanCode).toBeUndefined();
    expect(s.scopeSalesmanCodes).toEqual([]);
  });

  it("admin ที่ creator ตั้งให้เป็นเซลล์ → ได้ทั้งรหัสเซลล์และสิทธิ์ admin", async () => {
    dbAdmins.add("staff@sahapat.co.th");
    manualCodes = ["S555"];
    const s = await mod.buildSalesSessionWithAccess("staff@sahapat.co.th");
    expect(s.role).toBe("sales");
    expect(s.salesmanCode).toBe("S555");
    expect(s.adminAccess).toBe("admin");
  });

  it("ไม่ใช่ admin และไม่มีรหัส → login ไม่ได้เหมือนเดิม", async () => {
    await expect(mod.buildSalesSessionWithAccess("nobody@sahapat.co.th")).rejects.toThrow();
  });

  it("cookie เก่าก่อนแยกระดับ (admin ใน DB ถือ role admin) → ถูกลดเป็น admin จำกัดสิทธิ์ทันที", async () => {
    dbAdmins.add("staff@sahapat.co.th");
    const old: SalesSession = { email: "staff@sahapat.co.th", role: "admin", manualCodes: [] };
    const s = await revalidateOrThrow(mod, old);
    expect(s.role).toBe("sales");
    expect(s.adminAccess).toBe("admin");
  });

  it("creator ลบ admin ออก → session ที่ค้างอยู่เสียสิทธิ์หน้าตั้งค่าทันที", async () => {
    manualCodes = ["S555"];
    const s: SalesSession = {
      ...base,
      email: "staff@sahapat.co.th",
      salesmanCode: "S555",
      manualCodes: ["S555"],
      adminAccess: "admin",
    };
    const next = await revalidateOrThrow(mod, s);
    expect(next.adminAccess).toBeUndefined();
    expect(next.salesmanCode).toBe("S555");
  });

  it("ระดับไม่เปลี่ยน → ใช้ session เดิม (ไม่คำนวณใหม่ทุก request)", async () => {
    dbAdmins.add("staff@sahapat.co.th");
    const s: SalesSession = {
      email: "staff@sahapat.co.th",
      role: "sales",
      manualCodes: [],
      adminAccess: "admin",
    };
    expect(await mod.revalidateManualCodes(s)).toBe(s);
  });
});

async function revalidateOrThrow(
  mod: typeof import("@/lib/auth/sales-session"),
  s: SalesSession
): Promise<SalesSession> {
  const next = await mod.revalidateManualCodes(s);
  if (!next) throw new Error("expected a session");
  return next;
}
