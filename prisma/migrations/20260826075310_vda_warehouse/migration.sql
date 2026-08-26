-- CreateTable
CREATE TABLE "VdaWarehouse" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "customerCodes" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
