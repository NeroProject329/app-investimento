-- DropForeignKey
ALTER TABLE "Portfolio" DROP CONSTRAINT "Portfolio_cashInvestmentId_fkey";

-- AlterTable
ALTER TABLE "Portfolio" ALTER COLUMN "cashInvestmentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_cashInvestmentId_fkey" FOREIGN KEY ("cashInvestmentId") REFERENCES "Investment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
