const { prisma } = require("../lib/prisma");
const { buildDashboardByPortfolioId } = require("../services/dashboard.service");

async function getMyDashboard(req, res) {
  // req.user vem do requireAuth
  if (req.user.role !== "CLIENT") {
    return res.status(403).json({ ok: false, message: "Apenas CLIENT pode acessar este endpoint" });
  }

  const client = await prisma.client.findFirst({
    where: { userId: req.user.id },
    select: { id: true },
  });

  if (!client) {
    return res.status(404).json({ ok: false, message: "Cliente não encontrado" });
  }

  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId: client.id },
    select: { id: true },
  });

  if (!portfolio) {
    return res.status(404).json({ ok: false, message: "Portfolio não encontrado" });
  }

  const dashboard = await buildDashboardByPortfolioId(portfolio.id);
  return res.json(dashboard);
}

module.exports = { getMyDashboard };
