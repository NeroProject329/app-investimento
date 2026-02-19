const { prisma } = require("../lib/prisma");

async function getClientPortfolioId(userId) {
  const client = await prisma.client.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!client) return null;

  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId: client.id },
    select: { id: true, cashInvestmentId: true },
  });
  return portfolio;
}

async function listMyInvestments(req, res) {
  const portfolio = await getClientPortfolioId(req.user.id);
  if (!portfolio) return res.status(404).json({ ok: false, message: "Portfolio não encontrado" });

  const investments = await prisma.investment.findMany({
    where: { portfolioId: portfolio.id },
    orderBy: [{ isCash: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isCash: true,
      group: { select: { id: true, name: true } },
    },
  });

  return res.json({ ok: true, cashInvestmentId: portfolio.cashInvestmentId, investments });
}

async function listMyGroups(req, res) {
  const portfolio = await getClientPortfolioId(req.user.id);
  if (!portfolio) return res.status(404).json({ ok: false, message: "Portfolio não encontrado" });

  const groups = await prisma.investmentGroup.findMany({
    where: { portfolioId: portfolio.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return res.json({ ok: true, groups });
}

module.exports = { listMyInvestments, listMyGroups };
