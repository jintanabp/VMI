-- AlterTable
ALTER TABLE "Order" ADD COLUMN "decidedAt" DATETIME;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "c4FreeGoodCode" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "c4FreeGoodName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "c4FreeGoodQty" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "c4FreeGoodUnit" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "c4PooledQty" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "c4PromoGroup" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "c4PromoGroupMembers" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "c4PromoKind" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "c4PromoLabel" TEXT;
