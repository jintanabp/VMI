-- CreateTable
CREATE TABLE "SalesmanEmailAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "salesmanCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SalesmanEmailAssignment_email_idx" ON "SalesmanEmailAssignment"("email");

-- CreateIndex
CREATE INDEX "SalesmanEmailAssignment_salesmanCode_idx" ON "SalesmanEmailAssignment"("salesmanCode");

-- CreateIndex
CREATE UNIQUE INDEX "SalesmanEmailAssignment_email_salesmanCode_key" ON "SalesmanEmailAssignment"("email", "salesmanCode");
