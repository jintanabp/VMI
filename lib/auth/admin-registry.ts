import { prisma } from "@/lib/prisma";

let adminCache: Set<string> | null = null;

/** อ่านรายการ admin จาก env (รองรับ comma / semicolon เหมือน ocr-po APP_ADMINS) */
export function parseAdminEmailsFromEnv(): string[] {
  const raw =
    process.env.ADMIN_EMAILS?.trim() ||
    process.env.APP_ADMINS?.trim() ||
    "";
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function norm(email: string) {
  return email.trim().toLowerCase();
}

export async function refreshAdminCache(): Promise<Set<string>> {
  const merged = new Set(parseAdminEmailsFromEnv());
  const rows = await prisma.admin.findMany({ select: { email: true } });
  for (const row of rows) merged.add(row.email.toLowerCase());
  adminCache = merged;
  return merged;
}

export function isAdminEmailFromEnv(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmailsFromEnv().includes(email.toLowerCase());
}

/** ตรวจ admin — env + DB (cache อัปเดตตอน bootstrap / CRUD) */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  if (isAdminEmailFromEnv(e)) return true;
  return adminCache?.has(e) ?? false;
}

export async function isAdminEmailAsync(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase();
  if (isAdminEmailFromEnv(e)) return true;
  const cache = adminCache ?? (await refreshAdminCache());
  return cache.has(e);
}

export async function bootstrapAdminsFromEnv(): Promise<number> {
  const emails = parseAdminEmailsFromEnv();
  let inserted = 0;
  for (const email of emails) {
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (!existing) {
      await prisma.admin.create({
        data: { email, fromEnv: true, addedBy: "<bootstrap>" },
      });
      inserted++;
    } else if (!existing.fromEnv) {
      await prisma.admin.update({
        where: { email },
        data: { fromEnv: true },
      });
    }
  }
  await refreshAdminCache();
  if (inserted > 0) {
    console.info(`[Admin] Bootstrapped ${inserted} admin(s) from env`);
  }
  return inserted;
}

export async function listAdmins() {
  return prisma.admin.findMany({ orderBy: { addedAt: "asc" } });
}

export async function addAdmin(email: string, addedBy: string) {
  const e = norm(email);
  if (!e) throw new Error("ต้องระบุอีเมล");
  const row = await prisma.admin.upsert({
    where: { email: e },
    create: { email: e, fromEnv: false, addedBy: norm(addedBy) },
    update: {},
  });
  await refreshAdminCache();
  return row;
}

export async function removeAdmin(email: string) {
  const e = norm(email);
  const row = await prisma.admin.findUnique({ where: { email: e } });
  if (!row) return false;
  if (row.fromEnv) {
    throw new Error("ไม่สามารถลบ admin ที่มาจาก ADMIN_EMAILS ใน .env ได้");
  }
  await prisma.admin.delete({ where: { email: e } });
  await refreshAdminCache();
  return true;
}
