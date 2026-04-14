-- CreateTable
CREATE TABLE "BasketPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "fundName" TEXT NOT NULL,
    "budget" REAL NOT NULL,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orders" JSONB NOT NULL
);

-- CreateIndex
CREATE INDEX "BasketPurchase_fundId_idx" ON "BasketPurchase"("fundId");

-- CreateIndex
CREATE INDEX "BasketPurchase_placedAt_idx" ON "BasketPurchase"("placedAt");
