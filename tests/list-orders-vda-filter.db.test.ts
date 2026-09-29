import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * ตัวกรองคลังของ listOrders (29 ก.ย. 2569 — ตัวกรองรหัสเซลล์ของ creator)
 * ส่ง `vdaCodes: []` = รหัสที่เลือกไม่มีคลัง ต้องได้ลิสต์ว่าง ไม่ใช่ "ไม่กรอง" แล้วเห็นทุกร้าน
 */

const hasPrisma = prismaCliAvailable();

describe.skipIf(!hasPrisma)("listOrders — กรองตามคลัง", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let repo: typeof import("@/lib/repositories/prisma-repository").prismaOrderRepository;

  beforeAll(async () => {
    db = createTestDatabase("vmi-list-orders-vda");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    ({ prismaOrderRepository: repo } = await import("@/lib/repositories/prisma-repository"));
    for (const code of ["vda1", "vda2"]) {
      const store = await prisma.store.create({ data: { code, name: code.toUpperCase() } });
      await prisma.order.create({ data: { storeId: store.id, status: "pending_approval" } });
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  it("ไม่ส่ง vdaCodes = ทุกคลัง", async () => {
    expect(await repo.listOrders({})).toHaveLength(2);
  });

  it("ส่งคลังเดียว = เฉพาะคลังนั้น (ไม่สนตัวพิมพ์)", async () => {
    const list = (await repo.listOrders({ vdaCodes: ["VDA2"] })) as { store: { code: string } }[];
    expect(list.map((o) => o.store.code)).toEqual(["vda2"]);
  });

  it("ส่ง [] = ลิสต์ว่าง ไม่ใช่ทุกคลัง", async () => {
    expect(await repo.listOrders({ vdaCodes: [] })).toEqual([]);
  });
});
