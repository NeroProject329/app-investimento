const { prisma } = require("../lib/prisma");

function monthKey(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthRange(fromDate, toDate) {
  const out = [];
  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));

  let cur = start;
  while (cur <= end) {
    out.push(monthKey(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function centsToBRL(cents) {
  return Number((cents / 100).toFixed(2));
}

/**
 * Calcula saldos e séries mensais a partir das transações.
 * Observação: este cálculo é "contábil" (saldo), não TWR.
 */
async function buildDashboardByPortfolioId(portfolioId) {
  // 1) Carregar tudo que precisamos do DB (em poucas queries)
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { id: true, cashInvestmentId: true },
  });
  if (!portfolio) {
    const err = new Error("Portfolio não encontrado");
    err.statusCode = 404;
    throw err;
  }
  if (!portfolio.cashInvestmentId) {
    const err = new Error("CAIXA não configurado");
    err.statusCode = 409;
    throw err;
  }

  const investments = await prisma.investment.findMany({
    where: { portfolioId },
    select: {
      id: true,
      name: true,
      isCash: true,
      group: { select: { id: true, name: true } },
    },
    orderBy: [{ isCash: "desc" }, { name: "asc" }],
  });

  const transactions = await prisma.transaction.findMany({
    where: { portfolioId },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      type: true,
      amountCents: true,
      occurredAt: true,
      investmentId: true,
      fromInvestmentId: true,
      toInvestmentId: true,
    },
  });

  // 2) Saldos por investimento
  const balance = new Map(); // investmentId -> cents
  for (const inv of investments) balance.set(inv.id, 0);

  // 3) Série mensal (saldo total no "fim" de cada mês)
  // Guardamos o último estado daquele mês (após a última tx do mês)
  const monthSnapshots = new Map(); // YYYY-MM -> { totalCents, cashCents }

  function totalCentsNow() {
    let sum = 0;
    for (const v of balance.values()) sum += v;
    return sum;
  }

  function applyTx(tx) {
    const amt = tx.amountCents;

    if (tx.type === "DEPOSIT") {
      const id = tx.investmentId;
      balance.set(id, (balance.get(id) || 0) + amt);
      return;
    }
    if (tx.type === "WITHDRAW") {
      const id = tx.investmentId;
      balance.set(id, (balance.get(id) || 0) - amt);
      return;
    }
    if (tx.type === "GAIN") {
      const id = tx.investmentId;
      balance.set(id, (balance.get(id) || 0) + amt);
      return;
    }
    if (tx.type === "LOSS") {
      const id = tx.investmentId;
      balance.set(id, (balance.get(id) || 0) - amt);
      return;
    }
    if (tx.type === "ADJUST") {
      const id = tx.investmentId;
      // aqui assumimos ADJUST como + (se quiser ajuste negativo depois, a gente evolui)
      balance.set(id, (balance.get(id) || 0) + amt);
      return;
    }
    if (tx.type === "TRANSFER") {
      const from = tx.fromInvestmentId;
      const to = tx.toInvestmentId;
      balance.set(from, (balance.get(from) || 0) - amt);
      balance.set(to, (balance.get(to) || 0) + amt);
      return;
    }
  }

  for (const tx of transactions) {
    applyTx(tx);

    const mk = monthKey(new Date(tx.occurredAt));
    const total = totalCentsNow();
    const cash = balance.get(portfolio.cashInvestmentId) || 0;

    monthSnapshots.set(mk, { totalCents: total, cashCents: cash });
  }

  const now = new Date();
  const asOf = now.toISOString();

  // Se não tem transação ainda, devolve tudo zerado
  if (transactions.length === 0) {
    const byInvestment = investments.map((inv) => ({
      investmentId: inv.id,
      name: inv.name,
      isCash: inv.isCash,
      group: inv.group ? inv.group.name : null,
      balanceCents: 0,
      balanceBRL: 0,
      pct: 0,
    }));

    return {
      ok: true,
      asOf,
      totals: {
        portfolioCents: 0,
        portfolioBRL: 0,
        cashCents: 0,
        cashBRL: 0,
        initialCents: 0,
        initialBRL: 0,
        totalReturnPct: 0,
        monthlyReturnPct: 0,
      },
      allocation: { byInvestment, byGroup: [] },
      series: { monthly: [] },
    };
  }

  // 4) Série mensal contínua (do primeiro mês até hoje), carregando saldo quando não houver tx
  const firstDate = new Date(transactions[0].occurredAt);
  const months = monthRange(firstDate, now);

  const monthly = [];
  let lastTotal = 0;
  let lastCash = 0;

  for (const mk of months) {
    const snap = monthSnapshots.get(mk);
    if (snap) {
      lastTotal = snap.totalCents;
      lastCash = snap.cashCents;
    }
    monthly.push({
      month: mk,
      totalCents: lastTotal,
      totalBRL: centsToBRL(lastTotal),
      cashCents: lastCash,
      cashBRL: centsToBRL(lastCash),
    });
  }

  // 5) Totais atuais
  const portfolioCents = totalCentsNow();
  const cashCents = balance.get(portfolio.cashInvestmentId) || 0;

  // 6) Baseline inicial (primeiro ponto da série mensal)
 // 6) Baseline inicial (mantém — útil pra debug/series)
const initialCents = monthly[0]?.totalCents || 0;

// ✅ Capital aportado (DEPOSIT - WITHDRAW)
let contributedCents = 0;
for (const tx of transactions) {
  const t = String(tx.type || "").toUpperCase();
  if (t === "DEPOSIT") contributedCents += tx.amountCents;
  if (t === "WITHDRAW") contributedCents -= tx.amountCents;
}

// ✅ Lucro = AUM - capital aportado
const profitCents = portfolioCents - contributedCents;

// ✅ Retorno total (%): lucro / capital aportado
const totalReturnPct = contributedCents > 0
  ? Number(((profitCents / contributedCents) * 100).toFixed(2))
  : 0;

// mensal: compara mês atual vs mês anterior (fim do mês anterior)
const monthlyReturnPct = monthly.length >= 2 && monthly[monthly.length - 2].totalCents > 0
  ? Number((((portfolioCents - monthly[monthly.length - 2].totalCents) / monthly[monthly.length - 2].totalCents) * 100).toFixed(2))
  : 0;

  // 7) Alocação por investimento (saldo / total)
  const byInvestment = investments.map((inv) => {
    const b = balance.get(inv.id) || 0;
    return {
      investmentId: inv.id,
      name: inv.name,
      isCash: inv.isCash,
      group: inv.group ? inv.group.name : null,
      balanceCents: b,
      balanceBRL: centsToBRL(b),
      pct: pct(b, portfolioCents),
    };
  }).sort((a, b) => (b.balanceCents - a.balanceCents));

  // 8) Alocação por vertente (group)
  const groupMap = new Map(); // groupName -> cents
  for (const inv of investments) {
    const g = inv.group?.name || "Sem vertente";
    const b = balance.get(inv.id) || 0;
    groupMap.set(g, (groupMap.get(g) || 0) + b);
  }

  const byGroup = Array.from(groupMap.entries())
    .map(([name, cents]) => ({
      name,
      balanceCents: cents,
      balanceBRL: centsToBRL(cents),
      pct: pct(cents, portfolioCents),
    }))
    .sort((a, b) => b.balanceCents - a.balanceCents);

  return {
    ok: true,
    asOf,
    totals: {
      portfolioCents,
      portfolioBRL: centsToBRL(portfolioCents),
      cashCents,
      cashBRL: centsToBRL(cashCents),
      initialCents,
      initialBRL: centsToBRL(initialCents),
      totalReturnPct,
      monthlyReturnPct,
    },
    allocation: {
      byInvestment,
      byGroup,
    },
    series: {
      monthly, // linha do tempo mensal desde a entrada até hoje
    },
  };
}

module.exports = { buildDashboardByPortfolioId };
