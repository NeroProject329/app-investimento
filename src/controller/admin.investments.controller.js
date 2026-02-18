const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const createInvestmentSchema = z.object({
  name: z.string().min(2),
  groupId: z.string().optional().nullable(),
});

async function getPortfolioOrThrow(clientId) {
  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId },
    select: { id: true, cashInvestmentId: true },
  });

  if (!portfolio) {
    const err = new Error("Portfolio não encontrado para este cliente");
    err.statusCode = 404;
    throw err;
  }

  if (!portfolio.cashInvestmentId) {
    const err = new Error("CAIXA não configurado para este cliente");
    err.statusCode = 409;
    throw err;
  }

  return portfolio;
}

async function ensureGroupBelongsToPortfolio(groupId, portfolioId) {
  const group = await prisma.investmentGroup.findFirst({
    where: { id: groupId, portfolioId },
    select: { id: true },
  });
  if (!group) {
    const err = new Error("Vertente (groupId) inválida para este cliente");
    err.statusCode = 400;
    throw err;
  }
}

async function createInvestment(req, res) {
  const clientId = req.params.clientId;

  const parsed = createInvestmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  try {
    const portfolio = await getPortfolioOrThrow(clientId);

    const { name, groupId } = parsed.data;

    // regra: admin NÃO cria investimento isCash pelo endpoint (só existe um CAIXA)
    if (name.trim().toUpperCase() === "CAIXA") {
      return res.status(409).json({ ok: false, message: "CAIXA já existe e não pode ser recriado." });
    }

    if (groupId) await ensureGroupBelongsToPortfolio(groupId, portfolio.id);

    const investment = await prisma.investment.create({
      data: {
        portfolioId: portfolio.id,
        groupId: groupId || null,
        name,
        isCash: false,
      },
      select: { id: true, name: true, isCash: true, groupId: true },
    });

    return res.status(201).json({ ok: true, investment });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

async function listInvestments(req, res) {
  const clientId = req.params.clientId;

  try {
    const portfolio = await getPortfolioOrThrow(clientId);

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

    return res.json({ ok: true, investments, cashInvestmentId: portfolio.cashInvestmentId });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

module.exports = { createInvestment, listInvestments };
