const { prisma } = require("../lib/prisma");

/**
 * Calcula o saldo (cents) de um investimento baseado nas transações do portfolio.
 * - DEPOSIT/GAIN/ADJUST somam quando investmentId == invId
 * - WITHDRAW/LOSS subtraem quando investmentId == invId
 * - TRANSFER: subtrai se fromInvestmentId==invId, soma se toInvestmentId==invId
 */
async function getInvestmentBalanceCents(portfolioId, investmentId) {
  const txs = await prisma.transaction.findMany({
    where: {
      portfolioId,
      OR: [
        { investmentId },
        { fromInvestmentId: investmentId },
        { toInvestmentId: investmentId },
      ],
    },
    select: {
      type: true,
      amountCents: true,
      investmentId: true,
      fromInvestmentId: true,
      toInvestmentId: true,
    },
  });

  let bal = 0;

  for (const tx of txs) {
    const amt = tx.amountCents;

    if (tx.type === "DEPOSIT" && tx.investmentId === investmentId) bal += amt;
    else if (tx.type === "WITHDRAW" && tx.investmentId === investmentId) bal -= amt;

    else if (tx.type === "GAIN" && tx.investmentId === investmentId) bal += amt;
    else if (tx.type === "LOSS" && tx.investmentId === investmentId) bal -= amt;

    else if (tx.type === "ADJUST" && tx.investmentId === investmentId) bal += amt;

    else if (tx.type === "TRANSFER") {
      if (tx.fromInvestmentId === investmentId) bal -= amt;
      if (tx.toInvestmentId === investmentId) bal += amt;
    }
  }

  return bal;
}

module.exports = { getInvestmentBalanceCents };
