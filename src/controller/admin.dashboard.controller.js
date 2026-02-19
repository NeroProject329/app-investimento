const { prisma } = require("../lib/prisma");
const { buildDashboardByPortfolioId } = require("../services/dashboard.service");

async function getClientDashboard(req, res) {
  const clientId = req.params.clientId;

  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId },
    select: { id: true },
  });

  if (!portfolio) {
    return res.status(404).json({ ok: false, message: "Portfolio não encontrado para este cliente" });
  }

  const dashboard = await buildDashboardByPortfolioId(portfolio.id);
  return res.json(dashboard);
}

module.exports = { getClientDashboard };
