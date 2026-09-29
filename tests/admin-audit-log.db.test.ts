import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * บันทึกการทำงานของผู้ดูแล (29 ก.ย. 2569) — จดได้ ไม่โยน error และแบ่งหน้าไม่ข้ามแถวที่เวลาชนกัน
 */

const hasPrisma = prismaCliAvailable();

const creator = { email: "dev@vmi.test", role: "admin" as const, adminAccess: "creator" as const };
const staffAdmin = { email: "ops@vmi.test", role: "sales" as const, adminAccess: "admin" as const };

describe.skipIf(!hasPrisma)("admin audit log", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let audit: typeof import("@/lib/admin/audit-log");

  beforeAll(async () => {
    db = createTestDatabase("vmi-audit-log");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    audit = await import("@/lib/admin/audit-log");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  it("จดตำแหน่งผู้กดถูก (creator / admin) และ detail เป็น JSON", async () => {
    await audit.recordAudit(creator, "admin.add", "new@vmi.test");
    await audit.recordAudit(staffAdmin, "store.approve", "shop@vmi.test", { vdaCode: "vda1" });
    const { rows } = await audit.listAuditLog({});
    expect(rows.map((r) => [r.actorRole, r.action])).toEqual([
      ["admin", "store.approve"],
      ["creator", "admin.add"],
    ]);
    expect(JSON.parse(rows[0]!.detail)).toEqual({ vdaCode: "vda1" });
    expect(rows[0]!.actionLabel).toBe("อนุมัติบัญชีร้านค้า");
  });

  it("กรองด้วยอีเมลและประเภทได้", async () => {
    expect((await audit.listAuditLog({ q: "shop@" })).rows).toHaveLength(1);
    expect((await audit.listAuditLog({ action: "admin.add" })).rows).toHaveLength(1);
  });

  it("แบ่งหน้าด้วย id ไม่ข้ามแถวที่เวลาเดียวกัน", async () => {
    await prisma.adminAuditLog.deleteMany();
    const at = new Date("2026-09-29T03:00:00Z");
    await prisma.adminAuditLog.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        actorEmail: creator.email,
        actorRole: "creator",
        action: "orders.delete",
        target: `order-${i}`,
        createdAt: at,
      })),
    });
    const seen: string[] = [];
    let afterId: string | undefined;
    for (;;) {
      const page = await audit.listAuditLog({ afterId, limit: 2 });
      seen.push(...page.rows.map((r) => r.target));
      if (!page.hasMore) break;
      afterId = page.rows[page.rows.length - 1]!.id;
    }
    expect(seen.sort()).toEqual(["order-0", "order-1", "order-2", "order-3", "order-4"]);
  });

  it("detail ยาวถูกตัด และการจดล้มไม่โยน error", async () => {
    await audit.recordAudit(creator, "thresholds.update", "vda1", { big: "x".repeat(5000) });
    const row = await prisma.adminAuditLog.findFirst({ where: { action: "thresholds.update" } });
    expect(row!.detail.length).toBeLessThanOrEqual(2000);

    await prisma.$disconnect();
    const broken = { ...creator, email: undefined as unknown as string };
    await expect(audit.recordAudit(broken, "admin.remove", "x")).resolves.toBeUndefined();
  });
});
