import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * P0 / P1 จาก QA 28 ก.ย. 2569 — ฝั่งบัญชีร้านค้า
 *
 * - ตั้งรหัสผ่านครั้งแรกต้องมีรหัสตั้งค่าที่แอดมินส่งให้ (เดิมรู้แค่อีเมลก็ยึดบัญชีได้)
 * - รหัสตั้งค่าใช้ได้ครั้งเดียว · หมดอายุ · ออกใหม่แล้วอันเก่าใช้ไม่ได้
 * - ทุกการเปลี่ยนสิทธิ์/รหัส เพิ่ม sessionVersion ⇒ token ร้านเดิมใช้ไม่ได้
 * - ลบออเดอร์ที่มี PO อยู่ใน ERP แล้วไม่ได้ ต่อให้ยืนยัน "ลบพร้อม PO"
 */

const hasPrisma = prismaCliAvailable();
const PW = "รหัสผ่านใหม่1234";

describe.skipIf(!hasPrisma)("บัญชีร้านค้า — รหัสตั้งค่าครั้งแรก + รุ่นของ session", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let acc: typeof import("@/lib/auth/store-account");
  let sess: typeof import("@/lib/auth/store-session");

  beforeAll(async () => {
    db = createTestDatabase("vmi-store-security");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    acc = await import("@/lib/auth/store-account");
    sess = await import("@/lib/auth/store-session");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  it("แอดมินเพิ่มบัญชี → ได้รหัสตั้งค่า · ไม่มีรหัส/รหัสผิด ตั้งรหัสผ่านไม่ได้", async () => {
    const { account, setupCode } = await acc.createStoreAccountByAdmin({
      email: "new@vmi.test",
      vdaCode: "vda1",
      approvedBy: "admin@vmi.test",
    });
    expect(setupCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(account.setupCodeHash).not.toContain(setupCode!.replace("-", ""));

    expect((await acc.claimStoreAccount("new@vmi.test", "", PW)).ok).toBe(false);
    const wrong = await acc.claimStoreAccount("new@vmi.test", "AAAA-AAAA", PW);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toBe("bad_code");

    const row = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "new@vmi.test" } });
    expect(row.passwordHash).toBeNull();
  });

  it("รหัสถูก (พิมพ์เล็ก/ไม่มีขีดก็ได้) → ตั้งได้ · ใช้ซ้ำไม่ได้", async () => {
    const { setupCode } = await acc.createStoreAccountByAdmin({
      email: "ok@vmi.test",
      vdaCode: "vda1",
      approvedBy: "admin@vmi.test",
    });
    const typed = setupCode!.replace("-", "").toLowerCase();
    const res = await acc.claimStoreAccount("ok@vmi.test", typed, PW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.account.mustSetPassword).toBe(false);
      expect(res.account.setupCodeHash).toBeNull();
    }
    const again = await acc.claimStoreAccount("ok@vmi.test", setupCode!, "อีกรหัสหนึ่ง9999");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("already_set");
  });

  it("รหัสหมดอายุ → ใช้ไม่ได้", async () => {
    const { setupCode } = await acc.createStoreAccountByAdmin({
      email: "expired@vmi.test",
      vdaCode: "vda1",
      approvedBy: "admin@vmi.test",
    });
    await prisma.storeAccount.update({
      where: { email: "expired@vmi.test" },
      data: { setupCodeExpiresAt: new Date(Date.now() - 1000) },
    });
    const res = await acc.claimStoreAccount("expired@vmi.test", setupCode!, PW);
    expect(res.ok).toBe(false);
  });

  it("แอดมินรีเซ็ต → รหัสเดิมหาย · session เดิมใช้ไม่ได้ · รหัสตั้งค่าอันก่อนหน้าใช้ไม่ได้", async () => {
    const { setupCode: first } = await acc.createStoreAccountByAdmin({
      email: "reset@vmi.test",
      vdaCode: "vda1",
      approvedBy: "admin@vmi.test",
    });
    const claimed = await acc.claimStoreAccount("reset@vmi.test", first!, PW);
    expect(claimed.ok).toBe(true);
    const before = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "reset@vmi.test" } });
    const token = {
      email: "reset@vmi.test",
      vdaCode: "vda1",
      storeId: "s1",
      canManageMinMax: false,
      sessionVersion: before.sessionVersion,
    };
    expect(sess.reconcileStoreSession(token, before)).not.toBeNull();

    const { setupCode: second } = await acc.adminResetPassword("reset@vmi.test");
    const after = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "reset@vmi.test" } });
    expect(after.passwordHash).toBeNull();
    expect(sess.reconcileStoreSession(token, after)).toBeNull();

    // ออกรหัสใหม่อีกรอบ → อันที่สองใช้ไม่ได้แล้ว
    const { setupCode: third } = await acc.adminResetPassword("reset@vmi.test");
    expect((await acc.claimStoreAccount("reset@vmi.test", second!, PW)).ok).toBe(false);
    expect((await acc.claimStoreAccount("reset@vmi.test", third!, PW)).ok).toBe(true);
  });

  it("อนุมัติคำขอที่รออยู่ → ได้รหัสตั้งค่า · ต้องมี VDA ก่อน", async () => {
    await acc.requestStoreAccount("pending@vmi.test", "");
    await expect(acc.approveStoreAccount("pending@vmi.test", "admin@vmi.test")).rejects.toThrow();
    await acc.setStoreAccountVda("pending@vmi.test", "vda2");
    const { setupCode } = await acc.approveStoreAccount("pending@vmi.test", "admin@vmi.test");
    expect(setupCode).toBeTruthy();
    expect((await acc.claimStoreAccount("pending@vmi.test", setupCode!, PW)).ok).toBe(true);
  });

  it("session ร้าน: ถูกปฏิเสธ / ย้าย VDA / ลบบัญชี → ใช้ไม่ได้ · สิทธิ์ min/max อ่านค่าปัจจุบัน", async () => {
    const { setupCode } = await acc.createStoreAccountByAdmin({
      email: "sess@vmi.test",
      vdaCode: "vda1",
      approvedBy: "admin@vmi.test",
      canManageMinMax: true,
    });
    await acc.claimStoreAccount("sess@vmi.test", setupCode!, PW);
    const row = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "sess@vmi.test" } });
    const token = {
      email: "sess@vmi.test",
      vdaCode: "vda1",
      storeId: "s1",
      canManageMinMax: true,
      sessionVersion: row.sessionVersion,
    };

    await acc.setCanManageMinMax("sess@vmi.test", false);
    const noManage = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "sess@vmi.test" } });
    expect(sess.reconcileStoreSession(token, noManage)?.canManageMinMax).toBe(false);

    await acc.setStoreAccountVda("sess@vmi.test", "vda2");
    const moved = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "sess@vmi.test" } });
    expect(sess.reconcileStoreSession(token, moved)).toBeNull();

    await acc.rejectStoreAccount("sess@vmi.test", "admin@vmi.test");
    const rejected = await prisma.storeAccount.findUniqueOrThrow({ where: { email: "sess@vmi.test" } });
    expect(sess.reconcileStoreSession({ ...token, vdaCode: "vda2", sessionVersion: rejected.sessionVersion }, rejected)).toBeNull();

    expect(sess.reconcileStoreSession(token, null)).toBeNull();
  });

  it("token เก่าก่อนมี sessionVersion (= 0) ยังใช้ได้กับบัญชีที่ไม่เคยเปลี่ยน", () => {
    const account = {
      status: "approved",
      vdaCode: "vda1",
      sessionVersion: 0,
      mustSetPassword: false,
      passwordHash: "x",
      canManageMinMax: false,
    };
    const legacy = { email: "a@vmi.test", vdaCode: "vda1", storeId: "s", canManageMinMax: false };
    expect(sess.reconcileStoreSession(legacy, account)).not.toBeNull();
  });
});

describe.skipIf(!hasPrisma)("ลบออเดอร์ — ห้ามลบใบที่มี PO อยู่ใน ERP แล้ว", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let del: typeof import("@/lib/orders/delete-orders");
  const creator = { email: "dev@vmi.test", role: "admin" as const, adminAccess: "creator" as const };

  beforeAll(async () => {
    db = createTestDatabase("vmi-delete-erp");
    setTestDatabaseUrl(db.url);
    ({ prisma } = await import("@/lib/prisma"));
    del = await import("@/lib/orders/delete-orders");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  async function orderWithPo(tag: string, po: Record<string, unknown>) {
    const store = await prisma.store.upsert({
      where: { code: "vda1" },
      create: { code: "vda1", name: "VDA1" },
      update: {},
    });
    const order = await prisma.order.create({
      data: { storeId: store.id, status: "approved", clientRequestId: `del-${tag}` },
    });
    await prisma.purchaseOrder.create({
      data: {
        orderId: order.id,
        poNumber: `V1TEST${tag}`,
        groupKey: "A",
        priceKind: "c4",
        itemCount: 1,
        totalQty: 1,
        totalAmount: 100,
        ...po,
      },
    });
    return order.id;
  }

  it("ส่ง ERP สำเร็จแล้ว → in_erp แม้ allowIssuedPo", async () => {
    const id = await orderWithPo("SENT", { erpSentAt: new Date() });
    const r = await del.deleteOrdersForSession([id], creator, { allowIssuedPo: true, notifyStores: false });
    expect(r.deletedOrderIds).toEqual([]);
    expect(r.skipped).toEqual([{ orderId: id, reason: "in_erp" }]);
  });

  it("ส่งแล้วผลไม่ชัดเจน (timeout) → in_erp", async () => {
    const id = await orderWithPo("TMO", { erpAttemptedAt: new Date(), erpError: "timeout", erpFailureKind: "timeout" });
    const r = await del.deleteOrdersForSession([id], creator, { allowIssuedPo: true, notifyStores: false });
    expect(r.skipped[0]?.reason).toBe("in_erp");
  });

  it("ERP ปฏิเสธชัดเจน → ลบได้ และแจ้งร้านเสมอแม้ notify=0 (เพราะร้านเคยได้แจ้งว่าออก PO แล้ว)", async () => {
    const id = await orderWithPo("REJ", { erpAttemptedAt: new Date(), erpError: "dup", erpFailureKind: "rejected" });
    const r = await del.deleteOrdersForSession([id], creator, { allowIssuedPo: true, notifyStores: false });
    expect(r.deletedOrderIds).toEqual([id]);
    const n = await prisma.storeNotification.findMany({ where: { orderId: id, kind: "deleted" } });
    expect(n).toHaveLength(1);
  });

  it("ยังไม่เคยส่ง ERP → ลบได้เมื่อยืนยันลบพร้อม PO · ไม่ยืนยัน = has_po", async () => {
    const id = await orderWithPo("NEW", {});
    const blocked = await del.deleteOrdersForSession([id], creator, { allowIssuedPo: false, notifyStores: true });
    expect(blocked.skipped[0]?.reason).toBe("has_po");
    const ok = await del.deleteOrdersForSession([id], creator, { allowIssuedPo: true, notifyStores: true });
    expect(ok.deletedOrderIds).toEqual([id]);
  });

  it("poMayBeInErp — ตารางตัดสิน", () => {
    expect(del.poMayBeInErp({ erpSentAt: null })).toBe(false);
    expect(del.poMayBeInErp({ erpSentAt: new Date() })).toBe(true);
    expect(del.poMayBeInErp({ erpSentAt: null, erpAttemptedAt: new Date(), erpFailureKind: null })).toBe(true);
    expect(del.poMayBeInErp({ erpSentAt: null, erpAttemptedAt: new Date(), erpFailureKind: "rejected" })).toBe(false);
  });
});
