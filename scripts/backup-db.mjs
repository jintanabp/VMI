#!/usr/bin/env node
/**
 * SQLite backup — copy vmi.db to BACKUP_DIR with timestamp.
 * Usage: node scripts/backup-db.mjs
 * Docker: BACKUP_DIR=/app/backups DATABASE_URL=file:/app/data/vmi.db
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

function main() {
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
  fs.copyFileSync(dbPath, dest);

  const keep = Number(process.env.BACKUP_KEEP ?? "14");
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("vmi-") && f.endsWith(".db"))
    .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const old of files.slice(keep)) {
    fs.unlinkSync(path.join(backupDir, old.f));
  }

  console.info("[VMI backup] Saved", dest);
}

main();
