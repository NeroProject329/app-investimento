const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),

  type: z.enum(["DEPOSIT", "WITHDRAW", "TRANSFER", "GAIN", "LOSS", "ADJUST"]).optional(),
  investmentId: z.string().optional(),

  month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function monthToRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // próximo mês
  return { start, end };
}

async function getMyTransactions(req, res) {
  if (req.user.role !== "CLIENT") {
    return res.status(403).json({ ok: false, message: "Apenas CLIENT pode acessar este endpoint" });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Query inválida", errors: parsed.error.flatten() });
  }

  const { page, limit, type, investmentId, month, from, to } = parsed.data;

  // acha o client/portfolio do usuário logado
  const client = await prisma.client.findFirst({
    where: { userId: req.user.id },
    select: { id: true },
  });
  if (!client) return res.status(404).json({ ok: false, message: "Cliente não encontrado" });

  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId: client.id },
    select: { id: true },
  });
  if (!portfolio) return res.status(404).json({ ok: false, message: "Portfolio não encontrado" });

  // monta where dinâmico
  const where = { portfolioId: portfolio.id };

  if (type) where.type = type;

  // filtra por investimento envolvido (investmentId OU from/to em transfer)
  if (investmentId) {
    where.OR = [
      { investmentId },
      { fromInvestmentId: investmentId },
      { toInvestmentId: investmentId },
    ];
  }

  // filtro por tempo (month tem prioridade)
  if (month) {
    const { start, end } = monthToRange(month);
    where.occurredAt = { gte: start, lt: end };
  } else if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = new Date(from);
    if (to) where.occurredAt.lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        amountCents: true,
        occurredAt: true,
        note: true,

        investmentId: true,
        fromInvestmentId: true,
        toInvestmentId: true,

        investment: { select: { id: true, name: true } },
        fromInv: { select: { id: true, name: true } },
        toInv: { select: { id: true, name: true } },
      },
    }),
  ]);

  return res.json({
    ok: true,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    transactions,
  });
}

module.exports = { getMyTransactions };
