-- AlterTable
ALTER TABLE "Order" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
-- SQLite ยอมให้มี NULL ซ้ำได้ในดัชนี unique — ออเดอร์เก่าที่ยังไม่มีรหัสจึงไม่ชนกันเอง
CREATE UNIQUE INDEX "Order_clientRequestId_key" ON "Order"("clientRequestId");
