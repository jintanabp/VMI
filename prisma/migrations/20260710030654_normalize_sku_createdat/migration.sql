-- Normalize Sku.createdAt to Prisma's SQLite storage format (INTEGER unix ms).
-- The backfill in the previous migration wrote a TEXT literal; Prisma writes
-- DateTime as INTEGER milliseconds, so DB-level date filters/ordering would
-- otherwise mix storage classes and compare incorrectly.
-- 1577836800000 = 2020-01-01T00:00:00.000Z
UPDATE "Sku" SET "createdAt" = 1577836800000 WHERE typeof("createdAt") = 'text';
