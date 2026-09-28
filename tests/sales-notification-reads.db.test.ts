import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * สถานะ "อ่านแล้ว" ของแจ้งเตือนเซลล์เป็นของแต่ละคน (QA 28 ก.ย. 2569)
 * เดิม: คนหนึ่งเปิดกระดิ่ง = ทุกคนใน VDA เดียวกันเห็นว่าอ่านแล้ว
 */

const hasPrisma = prismaCliAvailable();

let current: { email: string; role: "sales"; manualCodes: string[]; previewBy?: string } = {
  email: "a@vmi.test",
  role: "sales",
  manualCodes: ["S1"],
};

vi.mock("@/lib/auth/sales-session", () => ({
  getSalesSession: async () => current,
  salesPreviewReadOnly: (s: { previewBy?: string } | null) =>
    s?.previewBy ? Response.json({ error: "preview" }, { status: 403 }) : null,
}));
vi.mock("@/lib/orders/access", () => ({
  resolveSalesmanCodesForFilter: () => ["S1"],
  resolveVdaCodesForSalesmanCodes: () => ["vda1"],
  resolveAllPersonVdaCodes: () => ["vda1"],
}));

describe.skipIf(!hasPrisma)("แจ้งเตือนเซลล์ — อ่านแล้วแยกรายคน", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let route: typeof import("@/app/api/sales/notifications/route");

  beforeAll(async () => {
    db = createTestDatabase("vmi-notif-reads");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    route = await import("@/app/api/sales/notifications/route");

    const store = await prisma.store.create({ data: { code: "vda1", name: "VDA1" } });
    const sku = await prisma.sku.create({ data: { code: "T1", name: "สินค้า" } });
    await prisma.salesNotification.createMany({
      data: [
        { storeId: store.id, kind: "order_created", title: "ใหม่ 1" },
        { storeId: store.id, kind: "order_created", title: "ใหม่ 2" },
      ],
    });
    await prisma.storeSkuBlock.create({ data: { storeId: store.id, skuId: sku.id, reason: "หมด" } });
    // หยุดสั่งที่หมดช่วงแล้ว — ไม่ต้องเตือน
    const sku2 = await prisma.sku.create({ data: { code: "T2", name: "สินค้า 2" } });
    await prisma.storeSkuBlock.create({
      data: { storeId: store.id, skuId: sku2.id, reason: "เก่า", effectiveTo: new Date(Date.now() - 86400000) },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  async function get() {
    return (await route.GET()).json() as Promise<{
      orderUnseenCount: number;
      blockUnseenCount: number;
      items: { skuCode: string }[];
    }>;
  }
  function post(body: unknown) {
    return route.POST(new Request("http://x/", { method: "POST", body: JSON.stringify(body) }));
  }

  it("A รับทราบทั้งหมด → A ไม่เหลือค้าง แต่ B ยังเห็นครบ", async () => {
    current = { email: "a@vmi.test", role: "sales", manualCodes: ["S1"] };
    expect((await get()).orderUnseenCount).toBe(2);
    await post({ type: "order" });
    await post({ type: "block" });
    const a = await get();
    expect(a.orderUnseenCount).toBe(0);
    expect(a.blockUnseenCount).toBe(0);

    current = { email: "B@vmi.test", role: "sales", manualCodes: ["S1"] };
    const b = await get();
    expect(b.orderUnseenCount).toBe(2);
    expect(b.blockUnseenCount).toBe(1);
  });

  it("หยุดสั่งที่หมดช่วงแล้วไม่ขึ้นในกระดิ่ง", async () => {
    const r = await get();
    expect(r.items.map((i) => i.skuCode)).toEqual(["T1"]);
  });

  it("กดซ้ำไม่สร้างแถวซ้ำ · มุมมองทดสอบกดรับทราบไม่ได้", async () => {
    current = { email: "a@vmi.test", role: "sales", manualCodes: ["S1"] };
    const again = await (await post({ type: "order" })).json();
    expect(again.count).toBe(0);
    current = { email: "c@vmi.test", role: "sales", manualCodes: ["S1"], previewBy: "dev@vmi.test" };
    expect((await post({ type: "order" })).status).toBe(403);
    expect(await prisma.salesNotificationRead.count({ where: { email: "c@vmi.test" } })).toBe(0);
  });

  it("แถวเก่าที่รับทราบแบบรวมไว้แล้ว (acknowledgedAt) ยังนับว่าอ่านแล้วสำหรับทุกคน", async () => {
    await prisma.salesNotification.updateMany({ data: { acknowledgedAt: new Date() } });
    current = { email: "new-person@vmi.test", role: "sales", manualCodes: ["S1"] };
    expect((await get()).orderUnseenCount).toBe(0);
  });
});
