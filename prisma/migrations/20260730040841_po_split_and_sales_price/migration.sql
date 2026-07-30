-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "priceKind" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalQty" INTEGER NOT NULL,
    "totalAmount" REAL NOT NULL,
    "exportPath" TEXT,
    "issuedBy" TEXT NOT NULL DEFAULT '',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PoSequence" (
    "bucket" TEXT NOT NULL PRIMARY KEY,
    "lastN" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "decidedBy" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("approvedAt", "createdAt", "id", "rejectReason", "status", "storeId") SELECT "approvedAt", "createdAt", "id", "rejectReason", "status", "storeId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "suggestedQty" INTEGER NOT NULL,
    "finalQty" INTEGER NOT NULL,
    "cvdEstimate" REAL,
    "minDays" INTEGER,
    "maxDays" INTEGER,
    "unitPriceOverride" REAL,
    "c4UnitPrice" REAL,
    "c4DiscountBaht" REAL,
    "c4DiscountPct" REAL,
    "c4NetUnitPrice" REAL,
    "c4PriceExpired" BOOLEAN,
    "priceFlagged" BOOLEAN NOT NULL DEFAULT false,
    "priceFlagReason" TEXT,
    "salesPriceOverride" REAL,
    "salesPriceBy" TEXT NOT NULL DEFAULT '',
    "salesPriceAt" DATETIME,
    "poGroup" TEXT,
    "purchaseOrderId" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("c4DiscountBaht", "c4DiscountPct", "c4NetUnitPrice", "c4PriceExpired", "c4UnitPrice", "cvdEstimate", "finalQty", "id", "maxDays", "minDays", "orderId", "priceFlagReason", "priceFlagged", "skuId", "suggestedQty", "unitPriceOverride") SELECT "c4DiscountBaht", "c4DiscountPct", "c4NetUnitPrice", "c4PriceExpired", "c4UnitPrice", "cvdEstimate", "finalQty", "id", "maxDays", "minDays", "orderId", "priceFlagReason", "priceFlagged", "skuId", "suggestedQty", "unitPriceOverride" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_purchaseOrderId_idx" ON "OrderItem"("purchaseOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orderId_idx" ON "PurchaseOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orderId_groupKey_key" ON "PurchaseOrder"("orderId", "groupKey");
