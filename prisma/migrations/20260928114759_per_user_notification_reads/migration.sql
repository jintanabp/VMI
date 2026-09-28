-- CreateTable
CREATE TABLE "SalesNotificationRead" (
    "notificationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("notificationId", "email"),
    CONSTRAINT "SalesNotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "SalesNotification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreSkuBlockRead" (
    "blockId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("blockId", "email"),
    CONSTRAINT "StoreSkuBlockRead_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "StoreSkuBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesNotificationRead_email_idx" ON "SalesNotificationRead"("email");

-- CreateIndex
CREATE INDEX "StoreSkuBlockRead_email_idx" ON "StoreSkuBlockRead"("email");
