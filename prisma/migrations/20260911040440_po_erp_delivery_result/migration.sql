-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "erpAttemptedAt" DATETIME;
ALTER TABLE "PurchaseOrder" ADD COLUMN "erpError" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "erpInsertedRows" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "erpSentAt" DATETIME;
