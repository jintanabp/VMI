-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "rejectedAt" DATETIME;
