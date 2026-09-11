import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  prismaCliAvailable,
  setTestDatabaseUrl,
  type TestDb,
} from "./helpers/test-db";

/**
 * ร้านเปลี่ยนรหัสผ่านเอง — ต้องรู้รหัสเดิม
 *
 * ทดสอบกับฐานข้อมูลจริงเพราะสิ่งที่ต้องพิสูจน์คือ "hash ถูกเขียนทับจริงและรหัสเดิมใช้ไม่ได้แล้ว"
 * ซึ่งเป็นผลข้างฐานข้อมูล ไม่ใช่ค่าที่ฟังก์ชันคืนกลับมา
 *
 * เคสที่เจ็บถ้าพลาด: ยอมเปลี่ยนโดยไม่ตรวจรหัสเดิม ⇒ คุกกี้ที่หลุดไปยึดบัญชีได้เลย
 */

const hasPrisma = prismaCliAvailable();

const EMAIL = "store-pw@vmi.test";
const OLD = "รหัสเดิม1234";
const NEW = "รหัสใหม่5678";

describe.skipIf(!hasPrisma)("changeStoreAccountPassword", () => {
  let db: TestDb;
  let prisma: import("@prisma/client").PrismaClient;
  let change: typeof import("@/lib/auth/store-account").changeStoreAccountPassword;
  let verify: typeof import("@/lib/auth/store-password").verifyStorePassword;
  let hash: typeof import("@/lib/auth/store-password").hashStorePassword;

  beforeAll(async () => {
    db = createTestDatabase("vmi-change-pw");
    setTestDatabaseUrl(db.url);

    ({ prisma } = await import("@/lib/prisma"));
    ({ changeStoreAccountPassword: change } = await import(
      "@/lib/auth/store-account"
    ));
    ({ verifyStorePassword: verify, hashStorePassword: hash } = await import(
      "@/lib/auth/store-password"
    ));

    await prisma.storeAccount.create({
      data: {
        email: EMAIL,
        vdaCode: "vda1",
        status: "approved",
        passwordHash: await hash(OLD),
        mustSetPassword: false,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    db?.cleanup();
  });

  it("รหัสเดิมผิด = ไม่เปลี่ยน และรหัสเดิมยังใช้ได้", async () => {
    const res = await change(EMAIL, "รหัสที่เดามั่ว", NEW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("wrong_current");

    const row = await prisma.storeAccount.findUnique({ where: { email: EMAIL } });
    expect(await verify(OLD, row?.passwordHash)).toBe(true);
  });

  it("รหัสใหม่ซ้ำของเดิม = ปฏิเสธ (และบอกว่าซ้ำ ไม่ใช่บอกว่าสั้น)", async () => {
    const res = await change(EMAIL, OLD, OLD);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("same_as_current");
  });

  it("รหัสใหม่สั้นเกิน = ปฏิเสธ", async () => {
    const res = await change(EMAIL, OLD, "สั้น");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("weak");
  });

  it("บัญชีที่ยังไม่เคยตั้งรหัส เปลี่ยนทางนี้ไม่ได้", async () => {
    const email = "never-set@vmi.test";
    await prisma.storeAccount.create({
      data: {
        email,
        vdaCode: "vda1",
        status: "approved",
        passwordHash: null,
        mustSetPassword: true,
      },
    });
    const res = await change(email, "อะไรก็ได้", NEW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("no_password");
  });

  it("รหัสเดิมถูก = เปลี่ยนสำเร็จ รหัสเดิมใช้ไม่ได้อีก", async () => {
    const res = await change(EMAIL, OLD, NEW);
    expect(res.ok).toBe(true);

    const row = await prisma.storeAccount.findUnique({ where: { email: EMAIL } });
    expect(await verify(NEW, row?.passwordHash)).toBe(true);
    expect(await verify(OLD, row?.passwordHash)).toBe(false);
    // เคลียร์คำขอรีเซ็ตที่ค้างอยู่ด้วย ไม่งั้นแอดมินยังเห็นว่าร้านนี้รอรีเซ็ตทั้งที่จัดการเองแล้ว
    expect(row?.resetRequestedAt).toBeNull();
    expect(row?.mustSetPassword).toBe(false);
  });

  it("ไม่มีบัญชีนี้ = not_found", async () => {
    const res = await change("ไม่มีจริง@vmi.test", OLD, NEW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });
});
