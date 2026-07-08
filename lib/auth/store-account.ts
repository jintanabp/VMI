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
