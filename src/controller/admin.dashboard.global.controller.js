const { prisma } = require("../lib/prisma");
const { Prisma } = require("@prisma/client");

function centsToBRL(cents) {
  return Number((cents / 100).toFixed(2));
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function monthKeyFromString(yyyyMM) {
  const [y, m] = String(yyyyMM).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
}

function monthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
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

async function getAdminDashboardGlobal(req, res) {
  try {
    const monthsWanted = clampInt(req.query.months, 12, 3, 60);
    const latestN = clampInt(req.query.latest, 8, 1, 30);
    const topInvN = clampInt(req.query.topInvestments, 5, 1, 20);
    const topClientsN = clampInt(req.query.topClients, 10, 3, 50);

    // 1) Clientes + portfolios (pra totals e ranking)
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

    const portfolios = clients.map((c) => c.portfolio).filter(Boolean);
    const portfolioIds = portfolios.map((p) => p.id);

    const cashIds = portfolios.map((p) => p.cashInvestmentId).filter(Boolean);

    if (portfolioIds.length === 0) {
      return res.json({
        ok: true,
        asOf: new Date().toISOString(),
        totals: {
          clientsCount: clients.length,
          aumCents: 0,
          aumBRL: 0,
          cashCents: 0,
          cashBRL: 0,
          investedCents: 0,
          investedBRL: 0,
        },
        series: { monthly: [] },
        allocation: { byGroup: [] },
        latestTransactions: [],
        topInvestments: [],
        topClients: [],
      });
    }

    // 2) Totais por portfolio (sem transfer)
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
      totalsMap.set(row.portfolioId, addTypes.has(row.type) ? cur + amt : cur - amt);
    }

    // 3) CASH por portfolio (direto + transfer in/out)
    const cashDirect = cashIds.length
      ? await prisma.transaction.groupBy({
          by: ["investmentId", "type"],
          where: {
            investmentId: { in: cashIds },
            type: { in: ["DEPOSIT", "WITHDRAW", "GAIN", "LOSS", "ADJUST"] },
          },
          _sum: { amountCents: true },
        })
      : [];

    const cashDirectMap = new Map(); // cashId -> cents
    for (const row of cashDirect) {
      const id = row.investmentId;
      const cur = cashDirectMap.get(id) || 0;
      const amt = row._sum.amountCents || 0;

      const addTypes = new Set(["DEPOSIT", "GAIN", "ADJUST"]);
      cashDirectMap.set(id, addTypes.has(row.type) ? cur + amt : cur - amt);
    }

    const cashOut = cashIds.length
      ? await prisma.transaction.groupBy({
          by: ["fromInvestmentId"],
          where: { type: "TRANSFER", fromInvestmentId: { in: cashIds } },
          _sum: { amountCents: true },
        })
      : [];

    const cashOutMap = new Map();
    for (const row of cashOut) cashOutMap.set(row.fromInvestmentId, row._sum.amountCents || 0);

    const cashIn = cashIds.length
      ? await prisma.transaction.groupBy({
          by: ["toInvestmentId"],
          where: { type: "TRANSFER", toInvestmentId: { in: cashIds } },
          _sum: { amountCents: true },
        })
      : [];

    const cashInMap = new Map();
    for (const row of cashIn) cashInMap.set(row.toInvestmentId, row._sum.amountCents || 0);

    // 4) Monta clientesOut + totals globais + topClients
    const clientsOut = clients.map((c) => {
      const p = c.portfolio;
      if (!p) {
        return {
          clientId: c.id,
          fullName: c.fullName,
          email: c.user?.email || null,
          profile: c.profile,
          portfolioCents: 0,
          cashCents: 0,
        };
      }

      const portfolioCents = totalsMap.get(p.id) || 0;

      const cashId = p.cashInvestmentId;
      const direct = cashDirectMap.get(cashId) || 0;
      const out = cashOutMap.get(cashId) || 0;
      const inn = cashInMap.get(cashId) || 0;
      const cashCents = direct - out + inn;

      return {
        clientId: c.id,
        fullName: c.fullName,
        email: c.user?.email || null,
        profile: c.profile,
        portfolioCents,
        cashCents,
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

    const investedCents = Math.max(0, totals.aumCents - totals.cashCents);

    const topClients = [...clientsOut]
      .sort((a, b) => (b.portfolioCents || 0) - (a.portfolioCents || 0))
      .slice(0, topClientsN)
      .map((c) => ({
        clientId: c.clientId,
        fullName: c.fullName,
        email: c.email,
        profile: c.profile,
        portfolioCents: c.portfolioCents,
        portfolioBRL: centsToBRL(c.portfolioCents),
        cashCents: c.cashCents,
        cashBRL: centsToBRL(c.cashCents),
      }));

    // 5) Série mensal global (via deltas mensais + cumulativo)
    // total delta mensal (sem transfer)
    const totalDeltaRows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          to_char(date_trunc('month',"occurredAt"), 'YYYY-MM') AS month,
          SUM(
            CASE
              WHEN "type" IN ('DEPOSIT','GAIN','ADJUST') THEN "amountCents"
              WHEN "type" IN ('WITHDRAW','LOSS') THEN - "amountCents"
              ELSE 0
            END
          )::bigint AS delta
        FROM "Transaction"
        WHERE "portfolioId" IN (${Prisma.join(portfolioIds)})
          AND "type" IN ('DEPOSIT','WITHDRAW','GAIN','LOSS','ADJUST')
        GROUP BY 1
        ORDER BY 1;
      `
    );

    const totalDeltaMap = new Map();
    for (const r of totalDeltaRows || []) {
      totalDeltaMap.set(r.month, Number(r.delta || 0));
    }

    // cash delta mensal (direto no cash + transfers in/out)
    let cashDeltaRows = [];
    if (cashIds.length) {
      const cashList = Prisma.join(cashIds);
      cashDeltaRows = await prisma.$queryRaw(
        Prisma.sql`
          SELECT
            to_char(date_trunc('month',"occurredAt"), 'YYYY-MM') AS month,
            SUM(
              CASE
                WHEN "investmentId" IN (${cashList}) AND "type" IN ('DEPOSIT','GAIN','ADJUST') THEN "amountCents"
                WHEN "investmentId" IN (${cashList}) AND "type" IN ('WITHDRAW','LOSS') THEN - "amountCents"
                WHEN "type"='TRANSFER' AND "toInvestmentId" IN (${cashList}) THEN "amountCents"
                WHEN "type"='TRANSFER' AND "fromInvestmentId" IN (${cashList}) THEN - "amountCents"
                ELSE 0
              END
            )::bigint AS delta
          FROM "Transaction"
          WHERE "portfolioId" IN (${Prisma.join(portfolioIds)})
            AND (
              ("investmentId" IN (${cashList}) AND "type" IN ('DEPOSIT','WITHDRAW','GAIN','LOSS','ADJUST'))
              OR ("type"='TRANSFER' AND ("toInvestmentId" IN (${cashList}) OR "fromInvestmentId" IN (${cashList})))
            )
          GROUP BY 1
          ORDER BY 1;
        `
      );
    }

    const cashDeltaMap = new Map();
    for (const r of cashDeltaRows || []) {
      cashDeltaMap.set(r.month, Number(r.delta || 0));
    }

    // define range de meses
    const now = new Date();
    const nowMk = monthKey(now);

    const firstTotal = totalDeltaMap.size ? monthKeyFromString([...totalDeltaMap.keys()].sort()[0]) : null;
    const firstCash = cashDeltaMap.size ? monthKeyFromString([...cashDeltaMap.keys()].sort()[0]) : null;

    const firstDate = firstTotal && firstCash
      ? (firstTotal < firstCash ? firstTotal : firstCash)
      : (firstTotal || firstCash);

    const months = firstDate ? monthRange(firstDate, now) : [nowMk];

    // cumulativo
    let cumTotal = 0;
    let cumCash = 0;
    const monthlyAll = months.map((mk) => {
      cumTotal += totalDeltaMap.get(mk) || 0;
      cumCash += cashDeltaMap.get(mk) || 0;
      return {
        month: mk,
        totalCents: cumTotal,
        totalBRL: centsToBRL(cumTotal),
        cashCents: cumCash,
        cashBRL: centsToBRL(cumCash),
      };
    });

    const monthly = monthlyAll.slice(-monthsWanted);

    // 6) Alocação por grupo (saldo atual)
    // Vamos calcular saldo por investimento (diretas + transfers) e agregar por group/cash.
    const investments = await prisma.investment.findMany({
      select: {
        id: true,
        name: true,
        isCash: true,
        portfolioId: true,
        group: { select: { name: true } },
      },
    });

    const invIds = investments.map((i) => i.id);
    const invMap = new Map(); // id -> meta
    for (const inv of investments) {
      invMap.set(inv.id, inv);
    }

    // direct: DEPOSIT/WITHDRAW/GAIN/LOSS/ADJUST por investmentId
    const direct = invIds.length
      ? await prisma.transaction.groupBy({
          by: ["investmentId", "type"],
          where: {
            investmentId: { in: invIds },
            type: { in: ["DEPOSIT", "WITHDRAW", "GAIN", "LOSS", "ADJUST"] },
          },
          _sum: { amountCents: true },
        })
      : [];

    const balMap = new Map(); // investmentId -> cents
    for (const invId of invIds) balMap.set(invId, 0);

    const addTypes = new Set(["DEPOSIT", "GAIN", "ADJUST"]);
    for (const row of direct) {
      const id = row.investmentId;
      if (!id) continue;
      const cur = balMap.get(id) || 0;
      const amt = row._sum.amountCents || 0;
      balMap.set(id, addTypes.has(row.type) ? cur + amt : cur - amt);
    }

    // transfers out
    const outRows = await prisma.transaction.groupBy({
      by: ["fromInvestmentId"],
      where: { type: "TRANSFER", fromInvestmentId: { in: invIds } },
      _sum: { amountCents: true },
    });
    for (const row of outRows) {
      const id = row.fromInvestmentId;
      const cur = balMap.get(id) || 0;
      balMap.set(id, cur - (row._sum.amountCents || 0));
    }

    // transfers in
    const inRows = await prisma.transaction.groupBy({
      by: ["toInvestmentId"],
      where: { type: "TRANSFER", toInvestmentId: { in: invIds } },
      _sum: { amountCents: true },
    });
    for (const row of inRows) {
      const id = row.toInvestmentId;
      const cur = balMap.get(id) || 0;
      balMap.set(id, cur + (row._sum.amountCents || 0));
    }

    // group allocation
    const groupMap = new Map(); // groupName -> cents
    for (const inv of investments) {
      const b = balMap.get(inv.id) || 0;
      const groupName = inv.isCash ? "CAIXA" : (inv.group?.name || "Sem grupo");
      groupMap.set(groupName, (groupMap.get(groupName) || 0) + b);
    }

    const byGroup = Array.from(groupMap.entries())
      .map(([name, cents]) => ({
        name,
        balanceCents: cents,
        balanceBRL: centsToBRL(cents),
        pct: pct(cents, totals.aumCents),
      }))
      .sort((a, b) => b.balanceCents - a.balanceCents);

    // 7) Top investments (sem CAIXA), consolidado por (groupName + name)
    // Precisamos contar quantos clientes possuem aquele ativo.
    const portfolioToClient = new Map();
    for (const c of clients) {
      if (c.portfolio?.id) portfolioToClient.set(c.portfolio.id, c.id);
    }

    const topMap = new Map(); // key -> {groupName,name,totalCents,clientsSet}
    for (const inv of investments) {
      if (inv.isCash) continue;

      const groupName = inv.group?.name || "Sem grupo";
      const name = String(inv.name || "").trim() || "Ativo";
      const key = `${groupName}|||${name}`;

      if (!topMap.has(key)) {
        topMap.set(key, { groupName, name, totalCents: 0, clientsSet: new Set() });
      }

      const agg = topMap.get(key);
      const b = balMap.get(inv.id) || 0;
      agg.totalCents += b;

      const clientId = portfolioToClient.get(inv.portfolioId);
      if (clientId) agg.clientsSet.add(clientId);
    }

    const topInvestments = Array.from(topMap.values())
      .map((x) => ({
        groupName: x.groupName,
        name: x.name,
        totalBalanceCents: x.totalCents,
        totalBalanceBRL: centsToBRL(x.totalCents),
        clientsCount: x.clientsSet.size,
        pct: pct(x.totalCents, totals.aumCents),
      }))
      .sort((a, b) => b.totalBalanceCents - a.totalBalanceCents)
      .slice(0, topInvN);

    // 8) Latest transactions (global)
    const latestRaw = await prisma.transaction.findMany({
      orderBy: { occurredAt: "desc" },
      take: latestN,
      select: {
        id: true,
        type: true,
        amountCents: true,
        occurredAt: true,
        note: true,
        investment: { select: { id: true, name: true } },
        fromInv: { select: { id: true, name: true } },
        toInv: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true } },
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
    });

    const latestTransactions = (latestRaw || []).map((t) => ({
      id: t.id,
      type: t.type,
      amountCents: t.amountCents,
      occurredAt: t.occurredAt,
      note: t.note ?? null,
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
      asOf: new Date().toISOString(),
      totals: {
        clientsCount: totals.clientsCount,
        aumCents: totals.aumCents,
        aumBRL: centsToBRL(totals.aumCents),
        cashCents: totals.cashCents,
        cashBRL: centsToBRL(totals.cashCents),
        investedCents,
        investedBRL: centsToBRL(investedCents),
      },
      series: { monthly },
      allocation: { byGroup },
      latestTransactions,
      topInvestments,
      topClients,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro interno" });
  }
}

module.exports = { getAdminDashboardGlobal };