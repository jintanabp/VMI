-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "priceKind" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalQty" INTEGER NOT NULL,
    "totalAmount" REAL NOT NULL,
    "exportPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "statusAt" DATETIME,
    "statusBy" TEXT NOT NULL DEFAULT '',
    "statusNote" TEXT NOT NULL DEFAULT '',
    "issuedBy" TEXT NOT NULL DEFAULT '',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrder" ("exportPath", "groupKey", "id", "issuedAt", "issuedBy", "itemCount", "orderId", "poNumber", "priceKind", "totalAmount", "totalQty") SELECT "exportPath", "groupKey", "id", "issuedAt", "issuedBy", "itemCount", "orderId", "poNumber", "priceKind", "totalAmount", "totalQty" FROM "PurchaseOrder";
DROP TABLE "PurchaseOrder";
ALTER TABLE "new_PurchaseOrder" RENAME TO "PurchaseOrder";
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE INDEX "PurchaseOrder_orderId_idx" ON "PurchaseOrder"("orderId");
CREATE UNIQUE INDEX "PurchaseOrder_orderId_groupKey_key" ON "PurchaseOrder"("orderId", "groupKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
