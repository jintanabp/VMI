#!/bin/sh
set -eu

mkdir -p /app/data/cache /app/data/logs /app/backups /app/logs/po-export

echo "[VMI] Running database migrations..."
npx prisma migrate deploy

if [ "${VMI_BACKUP_ON_START:-false}" = "true" ]; then
  echo "[VMI] Running startup backup..."
  node scripts/backup-db.mjs || true
fi

echo "[VMI] Starting Next.js on port ${PORT:-3000}..."
exec npx next start -p "${PORT:-3000}"
