-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("cvdEstimate", "finalQty", "id", "maxDays", "minDays", "orderId", "skuId", "suggestedQty") SELECT "cvdEstimate", "finalQty", "id", "maxDays", "minDays", "orderId", "skuId", "suggestedQty" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
