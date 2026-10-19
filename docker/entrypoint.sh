#!/bin/sh
set -eu

mkdir -p /app/data/cache /app/data/logs /app/backups /app/logs/po-export

# สำรองก่อน migrate — migration ที่ลบ/เปลี่ยนคอลัมน์ย้อนกลับไม่ได้
# ถ้าสำรองหลัง migrate สแนปช็อตที่ได้จะเป็นข้อมูลหลังพังไปแล้ว
#
# สำรองไม่สำเร็จ (ดิสก์เต็ม/สิทธิ์ไฟล์) — เดิม `|| true` แล้ว migrate ต่อเงียบ ๆ เห็นแค่ใน log
# ตอนนี้: มี migration รอ = หยุด ไม่ migrate โดยไม่มีสำเนา · ไม่มี migration รอ = เตือนแล้วเปิดต่อ
# (หยุดทุกครั้งจะทำให้ container วน restart เว็บล่มทั้งที่ไม่มีอะไรเสี่ยง)
# จำเป็นต้อง migrate จริง ๆ โดยไม่มีสำเนา: ตั้ง VMI_ALLOW_MIGRATE_WITHOUT_BACKUP=true ชั่วคราว
if [ "${VMI_BACKUP_ON_START:-true}" = "true" ]; then
  echo "[VMI] Running pre-migrate backup..."
  if ! node scripts/backup-db.mjs; then
    echo "[VMI] !!! Pre-migrate backup FAILED"
    if npx prisma migrate status >/dev/null 2>&1; then
      echo "[VMI] No pending migrations - starting without a fresh backup (fix the backup soon)"
    elif [ "${VMI_ALLOW_MIGRATE_WITHOUT_BACKUP:-false}" = "true" ]; then
      echo "[VMI] VMI_ALLOW_MIGRATE_WITHOUT_BACKUP=true - migrating WITHOUT a backup"
    else
      echo "[VMI] Pending migrations and no backup - refusing to migrate."
      echo "[VMI] Fix the backup (disk space / permissions on BACKUP_DIR), or set"
      echo "[VMI] VMI_ALLOW_MIGRATE_WITHOUT_BACKUP=true for one start if you accept the risk."
      exit 1
    fi
  fi
fi

echo "[VMI] Running database migrations..."
npx prisma migrate deploy

echo "[VMI] Starting Next.js on port ${PORT:-3000}..."
exec npx next start -p "${PORT:-3000}"
