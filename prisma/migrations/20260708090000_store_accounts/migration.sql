-- Reconcile Admin table (added out-of-band in some environments; no-op where it already exists)
CREATE TABLE IF NOT EXISTS "Admin" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "fromEnv" BOOLEAN NOT NULL DEFAULT false,
    "addedBy" TEXT NOT NULL DEFAULT '',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoreAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "vdaCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT,
    "mustSetPassword" BOOLEAN NOT NULL DEFAULT true,
    "canManageMinMax" BOOLEAN NOT NULL DEFAULT false,
    "resetRequestedAt" DATETIME,
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreGroupThreshold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "minDays" INTEGER NOT NULL DEFAULT 7,
    "maxDays" INTEGER NOT NULL DEFAULT 15,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreGroupThreshold_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreAccount_email_key" ON "StoreAccount"("email");

-- CreateIndex
CREATE INDEX "StoreAccount_vdaCode_idx" ON "StoreAccount"("vdaCode");

-- CreateIndex
CREATE UNIQUE INDEX "StoreGroupThreshold_storeId_section_key" ON "StoreGroupThreshold"("storeId", "section");
