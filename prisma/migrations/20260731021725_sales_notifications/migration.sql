-- CreateTable
CREATE TABLE "SalesNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    CONSTRAINT "SalesNotification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesNotification_storeId_acknowledgedAt_idx" ON "SalesNotification"("storeId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "SalesNotification_createdAt_idx" ON "SalesNotification"("createdAt");
