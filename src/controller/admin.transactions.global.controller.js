const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),

  clientId: z.string().optional(),
  type: z.enum(["DEPOSIT", "WITHDRAW", "TRANSFER", "GAIN", "LOSS", "ADJUST"]).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
});

function monthToRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

async function listAdminTransactionsGlobal(req, res) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Query inválida",
      errors: parsed.error.flatten(),
    });
  }

  const { page, limit, clientId, type, month } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {};

  if (type) where.type = type;

  // ✅ filtro por client -> resolve via portfolioId (mais seguro e rápido)
  if (clientId) {
    const portfolio = await prisma.portfolio.findUnique({
      where: { clientId },
      select: { id: true },
    });

    if (!portfolio) {
      return res.json({
        ok: true,
        page,
        limit,
        total: 0,
        totalPages: 1,
        transactions: [],
      });
    }

    where.portfolioId = portfolio.id;
  }

  if (month) {
    const { start, end } = monthToRange(month);
    where.occurredAt = { gte: start, lt: end };
  }

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

        // ✅ createdBy NÃO tem name no schema atual
        createdByUserId: true,
        createdBy: { select: { id: true, email: true } },

        // ✅ pegar o cliente via portfolio
        portfolio: {
          select: {
            client: {
              select: {
                id: true,
                fullName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const out = (transactions || []).map((t) => ({
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    occurredAt: t.occurredAt,
    note: t.note ?? null,

    investmentId: t.investmentId ?? null,
    fromInvestmentId: t.fromInvestmentId ?? null,
    toInvestmentId: t.toInvestmentId ?? null,

    investment: t.investment ?? null,
    fromInv: t.fromInv ?? null,
    toInv: t.toInv ?? null,

    createdBy: t.createdBy ? { id: t.createdBy.id, email: t.createdBy.email } : null,

    client: t.portfolio?.client
      ? {
          id: t.portfolio.client.id,
          fullName: t.portfolio.client.fullName,
          email: t.portfolio.client.user?.email ?? null,
        }
      : null,
  }));

  return res.json({
    ok: true,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    transactions: out,
  });
}

module.exports = { listAdminTransactionsGlobal };