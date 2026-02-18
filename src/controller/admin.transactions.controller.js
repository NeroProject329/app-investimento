const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const createTxSchema = z.object({
  type: z.enum(["DEPOSIT", "WITHDRAW", "TRANSFER", "GAIN", "LOSS", "ADJUST"]),
  amountCents: z.number().int().positive(),
  occurredAt: z.string().datetime().optional(), // ISO string
  note: z.string().max(200).optional().nullable(),

  // Para GAIN/LOSS/ADJUST:
  investmentId: z.string().optional().nullable(),

  // Para TRANSFER:
  fromInvestmentId: z.string().optional().nullable(),
  toInvestmentId: z.string().optional().nullable(),
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

async function ensureInvestmentBelongs(investmentId, portfolioId) {
  const inv = await prisma.investment.findFirst({
    where: { id: investmentId, portfolioId },
    select: { id: true },
  });
  if (!inv) {
    const err = new Error("investmentId inválido para este cliente");
    err.statusCode = 400;
    throw err;
  }
}

async function createTransaction(req, res) {
  const clientId = req.params.clientId;

  const parsed = createTxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  try {
    const portfolio = await getPortfolioOrThrow(clientId);
    const data = parsed.data;

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    // Normaliza note
    const note = data.note ? String(data.note) : null;

    // Regras por tipo
    if (data.type === "DEPOSIT" || data.type === "WITHDRAW") {
      // Sempre no CAIXA
      const tx = await prisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          type: data.type,
          amountCents: data.amountCents,
          occurredAt,
          note,
          investmentId: portfolio.cashInvestmentId,
        },
        select: { id: true, type: true, amountCents: true, occurredAt: true, investmentId: true },
      });

      return res.status(201).json({ ok: true, tx });
    }

    if (data.type === "TRANSFER") {
      if (!data.fromInvestmentId || !data.toInvestmentId) {
        return res.status(400).json({ ok: false, message: "TRANSFER exige fromInvestmentId e toInvestmentId" });
      }
      if (data.fromInvestmentId === data.toInvestmentId) {
        return res.status(400).json({ ok: false, message: "fromInvestmentId e toInvestmentId não podem ser iguais" });
      }

      await ensureInvestmentBelongs(data.fromInvestmentId, portfolio.id);
      await ensureInvestmentBelongs(data.toInvestmentId, portfolio.id);

      const tx = await prisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          type: "TRANSFER",
          amountCents: data.amountCents,
          occurredAt,
          note,
          fromInvestmentId: data.fromInvestmentId,
          toInvestmentId: data.toInvestmentId,
        },
        select: {
          id: true, type: true, amountCents: true, occurredAt: true,
          fromInvestmentId: true, toInvestmentId: true
        },
      });

      return res.status(201).json({ ok: true, tx });
    }

    // GAIN/LOSS/ADJUST
    if (!data.investmentId) {
      return res.status(400).json({ ok: false, message: `${data.type} exige investmentId` });
    }

    await ensureInvestmentBelongs(data.investmentId, portfolio.id);

    const tx = await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        type: data.type,
        amountCents: data.amountCents,
        occurredAt,
        note,
        investmentId: data.investmentId,
      },
      select: { id: true, type: true, amountCents: true, occurredAt: true, investmentId: true },
    });

    return res.status(201).json({ ok: true, tx });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

async function listTransactions(req, res) {
  const clientId = req.params.clientId;

  try {
    const portfolio = await getPortfolioOrThrow(clientId);

    const txs = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { occurredAt: "desc" },
      take: 200,
      select: {
        id: true,
        type: true,
        amountCents: true,
        occurredAt: true,
        note: true,
        investmentId: true,
        fromInvestmentId: true,
        toInvestmentId: true,
      },
    });

    return res.json({ ok: true, transactions: txs });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

module.exports = { createTransaction, listTransactions };
