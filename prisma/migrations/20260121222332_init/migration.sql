-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cik" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "value" REAL NOT NULL,
    "weight" REAL NOT NULL,
    "quarter" TEXT NOT NULL,
    "filingDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holding_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "averagePrice" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "totalValue" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RebalanceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "targetWeights" JSONB NOT NULL,
    "currentWeights" JSONB NOT NULL,
    "trades" JSONB NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Fund_cik_key" ON "Fund"("cik");

-- CreateIndex
CREATE INDEX "Fund_cik_idx" ON "Fund"("cik");

-- CreateIndex
CREATE INDEX "Holding_fundId_idx" ON "Holding"("fundId");

-- CreateIndex
CREATE INDEX "Holding_ticker_idx" ON "Holding"("ticker");

-- CreateIndex
CREATE INDEX "Holding_quarter_idx" ON "Holding"("quarter");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_fundId_ticker_quarter_key" ON "Holding"("fundId", "ticker", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPosition_ticker_key" ON "PortfolioPosition"("ticker");

-- CreateIndex
CREATE INDEX "PortfolioPosition_ticker_idx" ON "PortfolioPosition"("ticker");

-- CreateIndex
CREATE INDEX "RebalanceEvent_createdAt_idx" ON "RebalanceEvent"("createdAt");
