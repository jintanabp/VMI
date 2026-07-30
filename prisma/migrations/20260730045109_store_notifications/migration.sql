-- CreateTable
CREATE TABLE "StoreNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "poNumbers" TEXT NOT NULL DEFAULT '',
    "orderId" TEXT,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME
);

-- CreateIndex
CREATE INDEX "StoreNotification_storeId_readAt_idx" ON "StoreNotification"("storeId", "readAt");

-- CreateIndex
CREATE INDEX "StoreNotification_storeId_createdAt_idx" ON "StoreNotification"("storeId", "createdAt");
