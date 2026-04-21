-- CreateTable
CREATE TABLE "FundThesis" (
    "fundId" TEXT NOT NULL PRIMARY KEY,
    "thesis" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
