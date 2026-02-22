const { prisma } = require("../lib/prisma");

function toInt(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function monthRange(yyyyMM) {
  // yyyy-MM
  const [y, m] = String(yyyyMM || "").split("-").map(Number);
  if (!y || !m) return null;
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

async function listAdminTransactionsGlobal(req, res) {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 50)));
    const skip = (page - 1) * limit;

    const clientId = req.query.clientId ? String(req.query.clientId) : null;
    const type = req.query.type ? String(req.query.type).toUpperCase() : null;
    const month = req.query.month ? String(req.query.month) : null;

    const where = {};

    if (type) where.type = type;

    if (clientId) {
      where.portfolio = { clientId };
    }

    if (month) {
      const r = monthRange(month);
      if (!r) {
        return res.status(400).json({ ok: false, message: "month inválido. Use YYYY-MM" });
      }
      where.occurredAt = { gte: r.start, lt: r.end };
    }

    const [total, transactions] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
        include: {
          // cliente vem via portfolio
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

          // investimentos hidratados (igual você já tem no extrato do cliente)
          investment: { select: { id: true, name: true } },
          fromInv: { select: { id: true, name: true } },
          toInv: { select: { id: true, name: true } },

          // auditoria (quando existir)
          createdBy: { select: { id: true, email: true, name: true } },
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

      createdBy: t.createdBy
        ? { id: t.createdBy.id, email: t.createdBy.email, name: t.createdBy.name ?? null }
        : null,

      client: t.portfolio?.client
        ? {
            id: t.portfolio.client.id,
            fullName: t.portfolio.client.fullName,
            email: t.portfolio.client.user?.email ?? null,
          }
        : null,
    }));

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      ok: true,
      page,
      limit,
      total,
      totalPages,
      transactions: out,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro interno" });
  }
}

module.exports = { listAdminTransactionsGlobal };