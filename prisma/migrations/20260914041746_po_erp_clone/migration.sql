-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "erpReplacesPoNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "erpVoidedAt" DATETIME;
ALTER TABLE "PurchaseOrder" ADD COLUMN "replacedByPoNumber" TEXT;
