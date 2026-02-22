/*
  Warnings:

  - You are about to drop the column `portfolioId` on the `InvestmentGroup` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `InvestmentGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "InvestmentGroup" DROP CONSTRAINT "InvestmentGroup_portfolioId_fkey";

-- DropIndex
DROP INDEX "InvestmentGroup_portfolioId_name_key";

-- AlterTable
ALTER TABLE "InvestmentGroup" DROP COLUMN "portfolioId";

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentGroup_name_key" ON "InvestmentGroup"("name");
