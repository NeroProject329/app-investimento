const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const createGroupSchema = z.object({
  name: z.string().min(2, "Nome da vertente muito curto"),
});

async function getPortfolioOrThrow(clientId) {
  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId },
    select: { id: true },
  });

  if (!portfolio) {
    const err = new Error("Portfolio não encontrado para este cliente");
    err.statusCode = 404;
    throw err;
  }

  return portfolio;
}

async function createGroup(req, res) {
  const clientId = req.params.clientId;

  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  try {
    const portfolio = await getPortfolioOrThrow(clientId);

    const group = await prisma.investmentGroup.create({
      data: {
        portfolioId: portfolio.id,
        name: parsed.data.name,
      },
      select: { id: true, name: true },
    });

    return res.status(201).json({ ok: true, group });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Já existe uma vertente com esse nome nesse cliente." });
    }
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

async function listGroups(req, res) {
  const clientId = req.params.clientId;

  try {
    const portfolio = await getPortfolioOrThrow(clientId);

    const groups = await prisma.investmentGroup.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    return res.json({ ok: true, groups });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

module.exports = { createGroup, listGroups };
