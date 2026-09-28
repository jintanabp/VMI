import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { StoreAccount } from "@prisma/client";
import {
  hashStorePassword,
  validatePasswordStrength,
  verifyStorePassword,
} from "./store-password";

/**
 * รหัสตั้งค่าครั้งแรก — แอดมินออกให้ตอนสร้าง/อนุมัติ/รีเซ็ตรหัส แล้วส่งต่อให้ร้าน (LINE/โทร)
 * ร้านต้องกรอกรหัสนี้คู่กับรหัสผ่านใหม่ — รู้แค่อีเมลยึดบัญชีไม่ได้อีกต่อไป
 *
 * 8 ตัวจาก 31 ตัวอักษรที่ไม่สับสนกัน (ไม่มี 0/O 1/I/L) ≈ 39 บิต · ใช้ได้ครั้งเดียว · หมดอายุ 72 ชม.
 * · ตัวรับจำกัดจำนวนครั้งต่ออีเมล (set-password route) จึงเดาไม่ทัน · เก็บแค่ sha256
 */
const SETUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SETUP_CODE_LENGTH = 8;
export const SETUP_CODE_TTL_MS = 72 * 60 * 60 * 1000;

export function normalizeSetupCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashSetupCode(code: string): string {
  return createHash("sha256").update(normalizeSetupCode(code)).digest("hex");
}

function newSetupCode(): { code: string; display: string } {
  let code = "";
  for (let i = 0; i < SETUP_CODE_LENGTH; i++) {
    code += SETUP_CODE_ALPHABET[randomInt(SETUP_CODE_ALPHABET.length)];
  }
  return { code, display: `${code.slice(0, 4)}-${code.slice(4)}` };
}

/** ค่าที่ต้องเขียนลงแถวเมื่อออกรหัสใหม่ — รหัสเก่า (ถ้ามี) ใช้ไม่ได้ทันที */
function setupCodeFields(now = Date.now()) {
  const { code, display } = newSetupCode();
  return {
    display,
    data: {
      setupCodeHash: hashSetupCode(code),
      setupCodeExpiresAt: new Date(now + SETUP_CODE_TTL_MS),
    },
  };
}

export function setupCodeMatches(
  account: Pick<StoreAccount, "setupCodeHash" | "setupCodeExpiresAt">,
  code: string,
  now = new Date()
): boolean {
  if (!account.setupCodeHash || !account.setupCodeExpiresAt) return false;
  if (account.setupCodeExpiresAt <= now) return false;
  const given = Buffer.from(hashSetupCode(code), "hex");
  const stored = Buffer.from(account.setupCodeHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** ผลของ action ที่ออกรหัสตั้งค่า — `setupCode` คือตัวรหัสที่แอดมินต้องส่งต่อ (โชว์ครั้งเดียว) */
export interface WithSetupCode {
  account: StoreAccount;
  setupCode: string | null;
}

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
 * แอดมินจึงไม่เคยรู้รหัสของร้าน — แต่ได้รหัสตั้งค่าครั้งแรกไปส่งต่อให้ร้าน
 */
export async function createStoreAccountByAdmin(input: {
  email: string;
  vdaCode: string;
  approvedBy: string;
  canManageMinMax?: boolean;
}): Promise<WithSetupCode> {
  const e = norm(input.email);
  if (!isValidStoreEmail(e)) {
    throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
  }
  const existing = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (existing) {
    throw new Error(`มีบัญชี ${e} อยู่แล้ว (สถานะ: ${existing.status})`);
  }
  const vda = normVda(input.vdaCode);
  if (!vda) {
    throw new Error("ต้องเลือก VDA ให้บัญชีก่อน");
  }
  const setup = setupCodeFields();
  const account = await prisma.storeAccount.create({
    data: {
      email: e,
      vdaCode: vda,
      status: "approved",
      approvedBy: norm(input.approvedBy),
      mustSetPassword: true,
      canManageMinMax: input.canManageMinMax ?? false,
      ...setup.data,
    },
  });
  return { account, setupCode: setup.display };
}

/**
 * เปลี่ยนอีเมลของบัญชี (ร้านพิมพ์ผิด / ย้ายอีเมล)
 * คงรหัสผ่านและสิทธิ์เดิมไว้ — เปลี่ยนแค่ชื่อผู้ใช้ที่ใช้ล็อกอิน
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
    data: { email: to, sessionVersion: { increment: 1 } },
  });
}

export async function getStoreAccountByEmail(
  email: string
): Promise<StoreAccount | null> {
  const e = norm(email);
  if (!e) return null;
  return prisma.storeAccount.findUnique({ where: { email: e } });
}

/** สร้างคำขอสิทธิ์ (สถานะ pending) — ถ้ามีอยู่แล้วคืนตัวเดิม
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

/**
 * รูปที่ส่งออกไปหน้าเว็บของแอดมิน — **ห้ามส่งแถว StoreAccount ตรง ๆ** เพราะมี `passwordHash`
 * และรหัสตั้งค่าครั้งแรก (เดิมหลุดไปถึงเบราว์เซอร์ทุกครั้งที่เปิดหน้าบัญชีร้านค้า — QA 28 ก.ย. 69)
 */
export interface StoreAccountView {
  id: string;
  email: string;
  vdaCode: string;
  status: string;
  mustSetPassword: boolean;
  canManageMinMax: boolean;
  resetRequestedAt: Date | null;
  approvedBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** มีรหัสตั้งค่าครั้งแรกที่ยังใช้ได้อยู่หรือไม่ (ไม่ส่งตัวรหัส) */
  setupCodeActive: boolean;
  setupCodeExpiresAt: Date | null;
}

export function toStoreAccountView(a: StoreAccount, now = new Date()): StoreAccountView {
  const active =
    a.setupCodeHash != null && a.setupCodeExpiresAt != null && a.setupCodeExpiresAt > now;
  return {
    id: a.id,
    email: a.email,
    vdaCode: a.vdaCode,
    status: a.status,
    mustSetPassword: a.mustSetPassword,
    canManageMinMax: a.canManageMinMax,
    resetRequestedAt: a.resetRequestedAt,
    approvedBy: a.approvedBy,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    setupCodeActive: active,
    setupCodeExpiresAt: active ? a.setupCodeExpiresAt : null,
  };
}

export async function listStoreAccounts(vdaCode?: string) {
  return prisma.storeAccount.findMany({
    where: vdaCode ? { vdaCode: normVda(vdaCode) } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * อนุมัติคำขอที่รออยู่ — ถ้าร้านยังไม่เคยตั้งรหัส ออกรหัสตั้งค่าครั้งแรกให้แอดมินส่งต่อ
 * ต้องมี VDA ก่อน (อนุมัติโดยไม่มี VDA = บัญชีค้าง ร้านตั้งรหัสไม่ได้ และ admin แก้ VDA เองไม่ได้)
 */
export async function approveStoreAccount(
  email: string,
  approvedBy: string
): Promise<WithSetupCode> {
  const e = norm(email);
  const current = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (!current) throw new Error("ไม่พบบัญชีร้านค้า");
  if (!current.vdaCode) throw new Error("ต้องเลือก VDA ให้บัญชีก่อนอนุมัติ");
  const needsSetup = current.mustSetPassword || !current.passwordHash;
  const setup = needsSetup ? setupCodeFields() : null;
  const account = await prisma.storeAccount.update({
    where: { email: e },
    data: {
      status: "approved",
      approvedBy: norm(approvedBy),
      sessionVersion: { increment: 1 },
      ...(setup?.data ?? {}),
    },
  });
  return { account, setupCode: setup?.display ?? null };
}

export async function rejectStoreAccount(email: string, approvedBy: string) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    data: {
      status: "rejected",
      approvedBy: norm(approvedBy),
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  });
}

export async function setStoreAccountVda(email: string, vdaCode: string) {
  const e = norm(email);
  return prisma.storeAccount.update({
    where: { email: e },
    // ย้าย VDA = session เดิมผูกกับคลังเก่า ต้อง login ใหม่
    data: { vdaCode: normVda(vdaCode), sessionVersion: { increment: 1 } },
  });
}

export async function setCanManageMinMax(email: string, canManage: boolean) {
  const e = norm(email);
  // ไม่ต้องเพิ่ม sessionVersion — getStoreSession อ่านสิทธิ์นี้จากฐานข้อมูลทุก request อยู่แล้ว
  return prisma.storeAccount.update({
    where: { email: e },
    data: { canManageMinMax: canManage },
  });
}

export type ClaimError = "not_found" | "not_approved" | "already_set" | "no_vda" | "bad_code" | "weak";

/**
 * ร้านตั้งรหัสผ่านครั้งแรก (หรือหลังแอดมินรีเซ็ต) — **ต้องมีรหัสตั้งค่าที่แอดมินส่งให้**
 * สำเร็จแล้วรหัสตั้งค่าใช้ซ้ำไม่ได้ และ session อื่นของบัญชีนี้หลุดทั้งหมด
 */
export async function claimStoreAccount(
  email: string,
  setupCode: string,
  password: string
): Promise<{ ok: true; account: StoreAccount } | { ok: false; error: ClaimError; message?: string }> {
  const e = norm(email);
  const account = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (!account) return { ok: false, error: "not_found" };
  if (account.status !== "approved") return { ok: false, error: "not_approved" };
  if (!account.mustSetPassword && account.passwordHash) return { ok: false, error: "already_set" };
  if (!account.vdaCode) return { ok: false, error: "no_vda" };
  if (!setupCodeMatches(account, setupCode)) return { ok: false, error: "bad_code" };

  const weak = validatePasswordStrength(password);
  if (weak) return { ok: false, error: "weak", message: weak };

  const passwordHash = await hashStorePassword(password);
  // compare-and-set บน hash เดิม — สองคนกดพร้อมกันด้วยรหัสเดียวกัน ได้คนเดียว
  const res = await prisma.storeAccount.updateMany({
    where: { email: e, setupCodeHash: account.setupCodeHash },
    data: {
      passwordHash,
      mustSetPassword: false,
      resetRequestedAt: null,
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      sessionVersion: { increment: 1 },
    },
  });
  if (res.count === 0) return { ok: false, error: "bad_code" };
  const updated = await prisma.storeAccount.findUniqueOrThrow({ where: { email: e } });
  return { ok: true, account: updated };
}

/**
 * ร้านเปลี่ยนรหัสเอง — ต้องรู้รหัสเดิม
 *
 * ต่างจาก `claimStoreAccount` ที่ใช้ตอนตั้งครั้งแรก/หลังแอดมินรีเซ็ต (พิสูจน์ด้วยรหัสตั้งค่า)
 * ส่วนตัวนี้เป็นทางที่เปิดให้ร้านที่ล็อกอินอยู่เรียกได้ จึงต้องพิสูจน์รหัสเดิม
 * ไม่งั้นคุกกี้ที่หลุดไปเปลี่ยนรหัสเจ้าของบัญชีได้เลย
 *
 * คืน error code ไม่ใช่ข้อความ — ให้ route เป็นคนตัดสินว่าจะบอกผู้ใช้ว่าอะไร
 */
export type ChangePasswordError =
  | "not_found"
  | "no_password"
  | "wrong_current"
  | "same_as_current"
  | "weak";

export async function changeStoreAccountPassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true; account: StoreAccount } | { ok: false; error: ChangePasswordError; message?: string }> {
  const e = norm(email);
  const account = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (!account) return { ok: false, error: "not_found" };
  // บัญชีที่ยังไม่เคยตั้งรหัส (หรือโดนแอดมินรีเซ็ต) ไม่มีรหัสเดิมให้ยืนยัน — ต้องไปทางตั้งครั้งแรก
  if (account.mustSetPassword || !account.passwordHash) {
    return { ok: false, error: "no_password" };
  }

  const ok = await verifyStorePassword(currentPassword, account.passwordHash);
  if (!ok) return { ok: false, error: "wrong_current" };

  // ตรวจก่อนว่าซ้ำของเดิมไหม แล้วค่อยตรวจความแข็งแรง — ไม่งั้นคนที่รหัสเดิมสั้นกว่า 8 ตัว
  // (บัญชีเก่าก่อนยกขั้นต่ำ) จะได้ข้อความว่า "สั้นไป" ทั้งที่ปัญหาจริงคือพิมพ์รหัสเดิมซ้ำ
  if (await verifyStorePassword(newPassword, account.passwordHash)) {
    return { ok: false, error: "same_as_current" };
  }
  const weak = validatePasswordStrength(newPassword);
  if (weak) return { ok: false, error: "weak", message: weak };

  const passwordHash = await hashStorePassword(newPassword);
  const updated = await prisma.storeAccount.update({
    where: { email: e },
    // เปลี่ยนรหัส = session อื่นทุกเครื่องหลุด (route ออก session ใหม่ให้เครื่องที่เปลี่ยนเอง)
    data: {
      passwordHash,
      mustSetPassword: false,
      resetRequestedAt: null,
      sessionVersion: { increment: 1 },
    },
  });
  return { ok: true, account: updated };
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

/**
 * แอดมินรีเซ็ตรหัส — เคลียร์รหัสเดิม ออกรหัสตั้งค่าใหม่ให้ส่งต่อร้าน และเตะทุก session ของบัญชีนี้
 * (ใช้กับบัญชีที่ยังไม่เคยตั้งรหัสได้ด้วย = "ออกรหัสตั้งค่าใหม่" เมื่อรหัสเดิมหาย/หมดอายุ)
 */
export async function adminResetPassword(email: string): Promise<WithSetupCode> {
  const e = norm(email);
  const setup = setupCodeFields();
  const account = await prisma.storeAccount.update({
    where: { email: e },
    data: {
      passwordHash: null,
      mustSetPassword: true,
      resetRequestedAt: null,
      sessionVersion: { increment: 1 },
      ...setup.data,
    },
  });
  return { account, setupCode: setup.display };
}

export async function deleteStoreAccount(email: string) {
  const e = norm(email);
  const row = await prisma.storeAccount.findUnique({ where: { email: e } });
  if (!row) return false;
  await prisma.storeAccount.delete({ where: { email: e } });
  return true;
}
