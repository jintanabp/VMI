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
    "c4PromoLabel" TEXT,
    "c4PromoKind" TEXT,
    "c4PromoGroup" TEXT,
    "c4PromoGroupMembers" INTEGER,
    "c4PooledQty" INTEGER,
    "c4FreeGoodCode" TEXT,
    "c4FreeGoodName" TEXT,
    "c4FreeGoodQty" INTEGER,
    "c4FreeGoodUnit" TEXT,
    "discountFlagged" BOOLEAN NOT NULL DEFAULT false,
    "discountFlagReason" TEXT,
    "salesPriceOverride" REAL,
    "salesPriceBy" TEXT NOT NULL DEFAULT '',
    "salesPriceAt" DATETIME,
    "poGroup" TEXT,
    "purchaseOrderId" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("c4DiscountBaht", "c4DiscountPct", "c4FreeGoodCode", "c4FreeGoodName", "c4FreeGoodQty", "c4FreeGoodUnit", "c4NetUnitPrice", "c4PooledQty", "c4PriceExpired", "c4PromoGroup", "c4PromoGroupMembers", "c4PromoKind", "c4PromoLabel", "c4UnitPrice", "cvdEstimate", "finalQty", "id", "maxDays", "minDays", "orderId", "poGroup", "priceFlagReason", "priceFlagged", "purchaseOrderId", "salesPriceAt", "salesPriceBy", "salesPriceOverride", "skuId", "suggestedQty", "unitPriceOverride") SELECT "c4DiscountBaht", "c4DiscountPct", "c4FreeGoodCode", "c4FreeGoodName", "c4FreeGoodQty", "c4FreeGoodUnit", "c4NetUnitPrice", "c4PooledQty", "c4PriceExpired", "c4PromoGroup", "c4PromoGroupMembers", "c4PromoKind", "c4PromoLabel", "c4UnitPrice", "cvdEstimate", "finalQty", "id", "maxDays", "minDays", "orderId", "poGroup", "priceFlagReason", "priceFlagged", "purchaseOrderId", "salesPriceAt", "salesPriceBy", "salesPriceOverride", "skuId", "suggestedQty", "unitPriceOverride" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_purchaseOrderId_idx" ON "OrderItem"("purchaseOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

