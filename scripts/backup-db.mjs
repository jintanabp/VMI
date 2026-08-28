#!/usr/bin/env node
/**
 * SQLite backup — snapshot vmi.db into BACKUP_DIR with timestamp.
 * Usage: node scripts/backup-db.mjs
 * Docker: BACKUP_DIR=/app/backups DATABASE_URL=file:/app/data/vmi.db
 *
 * ใช้ `VACUUM INTO` ไม่ใช่ copyFileSync: ฐานข้อมูลถูกเขียนอยู่ตลอดเวลาที่ backup
 * ทำงาน ถ้าเปิดโหมด WAL การ copy ไฟล์ .db เฉย ๆ จะได้สแนปช็อตที่ขาด commit
 * ล่าสุด (อยู่ใน -wal ที่ไม่ได้ copy ไปด้วย) หรือแย่กว่านั้นคือไฟล์ที่ฉีกกลางคัน
 * VACUUM INTO ให้ SQLite เขียนสำเนาที่ consistent ออกมาเองในทรานแซกชันเดียว
 */
import fs from "fs";
import path from "path";

function resolveDbPath() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!url.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL for backup: ${url}`);
  }
  const raw = url.slice("file:".length);
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/** สำเนาแบบ consistent · ถอยไป copyFileSync ถ้า VACUUM INTO ใช้ไม่ได้ */
async function snapshot(dbPath, dest) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
    });
    try {
      // dest เป็นชื่อที่เราสร้างเองจาก timestamp — escape single quote เผื่อ path แปลก
      await prisma.$executeRawUnsafe(
        `VACUUM INTO '${dest.replace(/'/g, "''")}'`
      );
      return "vacuum";
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    console.warn(
      "[VMI backup] VACUUM INTO ไม่สำเร็จ ถอยไปใช้ copy:",
      err?.message ?? err
    );
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.copyFileSync(dbPath, dest);
    return "copy";
  }
}

async function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    console.warn("[VMI backup] Database not found:", dbPath);
    process.exit(0);
  }

  const backupDir =
    process.env.BACKUP_DIR?.trim() ||
    path.join(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `vmi-${stamp}.db`);
  const mode = await snapshot(dbPath, dest);

  const keep = Number(process.env.BACKUP_KEEP ?? "14");
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("vmi-") && f.endsWith(".db"))
    .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const old of files.slice(keep)) {
    fs.unlinkSync(path.join(backupDir, old.f));
  }

  console.info(`[VMI backup] Saved (${mode})`, dest);
}

main().catch((err) => {
  console.error("[VMI backup] Failed:", err);
  process.exit(1);
});
