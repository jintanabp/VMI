-- CreateTable
CREATE TABLE "StoreSkuBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    CONSTRAINT "StoreSkuBlock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreSkuBlock_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Backfill: SKU ที่มีอยู่แล้วถือว่า "ไม่ใหม่" (ตั้ง createdAt เป็นวันในอดีต)
-- SKU ที่ถูกสร้างหลังจากนี้จะได้ CURRENT_TIMESTAMP จริงตาม default
INSERT INTO "new_Sku" ("code", "id", "name", "createdAt") SELECT "code", "id", "name", '2020-01-01 00:00:00' FROM "Sku";
DROP TABLE "Sku";
ALTER TABLE "new_Sku" RENAME TO "Sku";
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StoreSkuBlock_storeId_idx" ON "StoreSkuBlock"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSkuBlock_storeId_skuId_key" ON "StoreSkuBlock"("storeId", "skuId");
