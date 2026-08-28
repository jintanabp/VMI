#!/bin/sh
set -eu

mkdir -p /app/data/cache /app/data/logs /app/backups /app/logs/po-export

# สำรองก่อน migrate — migration ที่ลบ/เปลี่ยนคอลัมน์ย้อนกลับไม่ได้
# ถ้าสำรองหลัง migrate สแนปช็อตที่ได้จะเป็นข้อมูลหลังพังไปแล้ว
if [ "${VMI_BACKUP_ON_START:-true}" = "true" ]; then
  echo "[VMI] Running pre-migrate backup..."
  node scripts/backup-db.mjs || true
fi

echo "[VMI] Running database migrations..."
npx prisma migrate deploy

echo "[VMI] Starting Next.js on port ${PORT:-3000}..."
exec npx next start -p "${PORT:-3000}"
