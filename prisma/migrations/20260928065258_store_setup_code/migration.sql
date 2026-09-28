-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "vdaCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT,
    "mustSetPassword" BOOLEAN NOT NULL DEFAULT true,
    "canManageMinMax" BOOLEAN NOT NULL DEFAULT false,
    "resetRequestedAt" DATETIME,
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "setupCodeHash" TEXT,
    "setupCodeExpiresAt" DATETIME,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StoreAccount" ("approvedBy", "canManageMinMax", "createdAt", "email", "id", "mustSetPassword", "passwordHash", "resetRequestedAt", "status", "updatedAt", "vdaCode") SELECT "approvedBy", "canManageMinMax", "createdAt", "email", "id", "mustSetPassword", "passwordHash", "resetRequestedAt", "status", "updatedAt", "vdaCode" FROM "StoreAccount";
DROP TABLE "StoreAccount";
ALTER TABLE "new_StoreAccount" RENAME TO "StoreAccount";
CREATE UNIQUE INDEX "StoreAccount_email_key" ON "StoreAccount"("email");
CREATE INDEX "StoreAccount_vdaCode_idx" ON "StoreAccount"("vdaCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
