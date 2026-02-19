const { prisma } = require("../lib/prisma");

function centsToBRL(cents) {
  return Number((cents / 100).toFixed(2));
}

async function getMetrics(req, res) {
  // 1) pega clientes + portfolio
  const clients = await prisma.client.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      profile: true,
      user: { select: { email: true } },
      portfolio: { select: { id: true, cashInvestmentId: true } },
    },
  });

  const portfolios = clients
    .map((c) => c.portfolio)
    .filter(Boolean);

  const portfolioIds = portfolios.map((p) => p.id);
  const cashIds = portfolios.map((p) => p.cashInvestmentId).filter(Boolean);

  // 2) total de carteira por portfolio (TRANSFER não muda total)
  const sums = await prisma.transaction.groupBy({
    by: ["portfolioId", "type"],
    where: {
      portfolioId: { in: portfolioIds },
      type: { in: ["DEPOSIT", "WITHDRAW", "GAIN", "LOSS", "ADJUST"] },
    },
    _sum: { amountCents: true },
  });

  const totalsMap = new Map(); // portfolioId -> cents
  for (const row of sums) {
    const cur = totalsMap.get(row.portfolioId) || 0;
    const amt = row._sum.amountCents || 0;

    const addTypes = new Set(["DEPOSIT", "GAIN", "ADJUST"]);
    const next = addTypes.has(row.type) ? cur + amt : cur - amt;

    totalsMap.set(row.portfolioId, next);
  }

  // 3) saldo do CAIXA por portfolio
  // 3.1 diretas no cash (investmentId=cashId)
  const cashDirect = await prisma.transaction.groupBy({
    by: ["investmentId", "type"],
    where: {
      investmentId: { in: cashIds },
      type: { in: ["DEPOSIT", "WITHDRAW", "GAIN", "LOSS", "ADJUST"] },
    },
    _sum: { amountCents: true },
  });

  const cashDirectMap = new Map(); // cashId -> cents
  for (const row of cashDirect) {
    const id = row.investmentId;
    const cur = cashDirectMap.get(id) || 0;
    const amt = row._sum.amountCents || 0;

    const addTypes = new Set(["DEPOSIT", "GAIN", "ADJUST"]);
    const next = addTypes.has(row.type) ? cur + amt : cur - amt;

    cashDirectMap.set(id, next);
  }

  // 3.2 transfer out do cash
  const cashOut = await prisma.transaction.groupBy({
    by: ["fromInvestmentId"],
    where: {
      type: "TRANSFER",
      fromInvestmentId: { in: cashIds },
    },
    _sum: { amountCents: true },
  });

  const cashOutMap = new Map(); // cashId -> cents
  for (const row of cashOut) {
    cashOutMap.set(row.fromInvestmentId, row._sum.amountCents || 0);
  }

  // 3.3 transfer in pro cash
  const cashIn = await prisma.transaction.groupBy({
    by: ["toInvestmentId"],
    where: {
      type: "TRANSFER",
      toInvestmentId: { in: cashIds },
    },
    _sum: { amountCents: true },
  });

  const cashInMap = new Map(); // cashId -> cents
  for (const row of cashIn) {
    cashInMap.set(row.toInvestmentId, row._sum.amountCents || 0);
  }

  // 4) última transação por portfolio
  const lastTx = await prisma.transaction.groupBy({
    by: ["portfolioId"],
    where: { portfolioId: { in: portfolioIds } },
    _max: { occurredAt: true },
    _count: { _all: true },
  });

  const lastTxMap = new Map();
  for (const row of lastTx) {
    lastTxMap.set(row.portfolioId, {
      lastOccurredAt: row._max.occurredAt,
      txCount: row._count._all,
    });
  }

  // 5) monta resposta por cliente
  const clientsOut = clients.map((c) => {
    const p = c.portfolio;
    if (!p) {
      return {
        clientId: c.id,
        fullName: c.fullName,
        email: c.user.email,
        profile: c.profile,
        portfolioCents: 0,
        portfolioBRL: 0,
        cashCents: 0,
        cashBRL: 0,
        lastOccurredAt: null,
        txCount: 0,
      };
    }

    const portfolioCents = totalsMap.get(p.id) || 0;

    const cashId = p.cashInvestmentId;
    const direct = cashDirectMap.get(cashId) || 0;
    const out = cashOutMap.get(cashId) || 0;
    const inn = cashInMap.get(cashId) || 0;
    const cashCents = direct - out + inn;

    const last = lastTxMap.get(p.id) || { lastOccurredAt: null, txCount: 0 };

    return {
      clientId: c.id,
      fullName: c.fullName,
      email: c.user.email,
      profile: c.profile,
      portfolioCents,
      portfolioBRL: centsToBRL(portfolioCents),
      cashCents,
      cashBRL: centsToBRL(cashCents),
      lastOccurredAt: last.lastOccurredAt,
      txCount: last.txCount,
    };
  });

  const totals = clientsOut.reduce(
    (acc, cur) => {
      acc.clientsCount += 1;
      acc.aumCents += cur.portfolioCents;
      acc.cashCents += cur.cashCents;
      return acc;
    },
    { clientsCount: 0, aumCents: 0, cashCents: 0 }
  );

  return res.json({
    ok: true,
    totals: {
      clientsCount: totals.clientsCount,
      aumCents: totals.aumCents,
      aumBRL: centsToBRL(totals.aumCents),
      cashCents: totals.cashCents,
      cashBRL: centsToBRL(totals.cashCents),
    },
    clients: clientsOut,
  });
}

module.exports = { getMetrics };
