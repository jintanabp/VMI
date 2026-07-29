import { prisma } from "@/lib/prisma";
import type { StoreAccount } from "@prisma/client";
import { hashStorePassword } from "./store-password";

export type StoreAccountStatus = "pending" | "approved" | "rejected";

function norm(email: string) {
  return email.trim().toLowerCase();
}

function normVda(code: string) {
  return code.trim().toLowerCase();
}

/** ตรวจรูปแบบอีเมลแบบพอเพียง — กันพิมพ์ผิดจนล็อกอินไม่ได้ ไม่ได้ตั้งใจตรวจตาม RFC เป๊ะ */
export function isValidStoreEmail(email: string): boolean {
  const e = norm(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * แอดมินสร้างบัญชีร้านค้าเอง — อนุมัติให้ทันทีโดยไม่ต้องรอร้านยื่นคำขอ
 * ไม่ตั้งรหัสผ่านให้ (mustSetPassword = true) ร้านต้องตั้งรหัสเองครั้งแรกที่เข้าระบบ
 * แอดมินจึงไม่เคยรู้รหัสของร้าน
 */
export async function createStoreAccountByAdmin(input: {
  email: string;
  vdaCode: string;
  approvedBy: string;
  canManageMinMax?: boolean;
}): Promise<StoreAccount> {
  const e = norm(input.email);
  if (!isValidStoreEmail(e)) {
    throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
  }
  const existing = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (existing) {
    throw new Error(`มีบัญชี ${e} อยู่แล้ว (สถานะ: ${existing.status})`);
  }
  return prisma.storeAccount.create({
    data: {
      email: e,
      vdaCode: normVda(input.vdaCode),
      status: "approved",
      approvedBy: norm(input.approvedBy),
      mustSetPassword: true,
      canManageMinMax: input.canManageMinMax ?? false,
    },
  });
}

/**
 * เปลี่ยนอีเมลของบัญชี (ร้านพิมพ์ผิด / ย้ายอีเมล)
 * คงรหัสผ่านและสิทธิเดิมไว้ — เปลี่ยนแค่ชื่อผู้ใช้ที่ใช้ล็อกอิน
 * ไม่มีตารางอื่นอ้างอิงอีเมลนี้ (ออเดอร์ผูกกับ storeId) จึงไม่ต้องตามแก้ที่อื่น
 */
export async function changeStoreAccountEmail(
  currentEmail: string,
  nextEmail: string
): Promise<StoreAccount> {
  const from = norm(currentEmail);
  const to = norm(nextEmail);
  if (!isValidStoreEmail(to)) {
    throw new Error("รูปแบบอีเมลใหม่ไม่ถูกต้อง");
  }
  if (from === to) {
    throw new Error("อีเมลใหม่ซ้ำกับอีเมลเดิม");
  }
  const account = await prisma.storeAccount.findUnique({ where: { email: from } });
  if (!account) {
    throw new Error("ไม่พบบัญชีที่ต้องการแก้ไข");
  }
  const taken = await prisma.storeAccount.findUnique({ where: { email: to } });
  if (taken) {
    throw new Error(`อีเมล ${to} ถูกใช้กับบัญชีอื่นแล้ว`);
  }
  return prisma.storeAccount.update({
    where: { email: from },
    data: { email: to },
  });
}

export async function getStoreAccountByEmail(
  email: string
): Promise<StoreAccount | null> {
  const e = norm(email);
  if (!e) return null;
  return prisma.storeAccount.findUnique({ where: { email: e } });
}

/** สร้างคำขอสิทธิ (สถานะ pending) — ถ้ามีอยู่แล้วคืนตัวเดิม
 *  VDA เว้นว่างได้ ให้แอดมินกำหนดตอนอนุมัติ */
export async function requestStoreAccount(
  email: string,
  vdaCode = ""
): Promise<StoreAccount> {
  const e = norm(email);
  const vda = normVda(vdaCode);
  const existing = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (existing) return existing;

  return prisma.storeAccount.create({
    data: {
      email: e,
      vdaCode: vda,
      status: "pending",
      mustSetPassword: true,
    },
  });
}

export async function listStoreAccounts(vdaCode?: string) {
  return prisma.storeAccount.findMany({
    where: vdaCode ? { vdaCode: normVda(vdaCode) } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function approveStoreAccount(email: string, approvedBy: string) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    data: { status: "approved", approvedBy: norm(approvedBy) },
  });
}

export async function rejectStoreAccount(email: string, approvedBy: string) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    data: { status: "rejected", approvedBy: norm(approvedBy) },
  });
}

export async function setStoreAccountVda(email: string, vdaCode: string) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    data: { vdaCode: normVda(vdaCode) },
  });
}

export async function setCanManageMinMax(email: string, canManage: boolean) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    data: { canManageMinMax: canManage },
  });
}

export async function setStoreAccountPassword(email: string, password: string) {
  const e = norm(email);
  const passwordHash = await hashStorePassword(password);
  return prisma.storeAccount.update({
    where: { email: e },
    data: { passwordHash, mustSetPassword: false, resetRequestedAt: null },
  });
}

/** ร้านค้าขอรีเซ็ตรหัส — บันทึกเวลาให้แอดมินเห็น */
export async function requestPasswordReset(email: string) {
  const e = norm(email);
  const account = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (!account) return null;
  return prisma.storeAccount.update({
    where: { email: e },
    data: { resetRequestedAt: new Date() },
  });
}

/** แอดมินรีเซ็ตรหัส — เคลียร์รหัสเดิม ให้ร้านตั้งใหม่ */
export async function adminResetPassword(email: string) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    data: {
      passwordHash: null,
      mustSetPassword: true,
      resetRequestedAt: null,
    },
  });
}

export async function deleteStoreAccount(email: string) {
  const e = norm(email);
  const row = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (!row) return false;
  await prisma.storeAccount.delete({ where: { email: e } });
  return true;
}
