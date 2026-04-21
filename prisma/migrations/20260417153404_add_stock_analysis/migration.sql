-- CreateTable
CREATE TABLE "StockAnalysis" (
    "ticker" TEXT NOT NULL PRIMARY KEY,
    "summary" TEXT NOT NULL,
    "bullCase" TEXT NOT NULL,
    "bearCase" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
