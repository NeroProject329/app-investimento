const { prisma } = require("../lib/prisma");

function normalizeName(s) {
  return String(s || "").trim();
}

// soma segura
function add(map, key, delta) {
  map.set(key, (map.get(key) || 0) + delta);
}

async function listAdminInvestmentsGlobal(req, res) {
  try {
    const includePositions = String(req.query.includePositions || "false") === "true";

    // 1) lista investimentos NÃO-CAIXA (isCash=false)
    const investments = await prisma.investment.findMany({
      where: { isCash: false },
      select: {
        id: true,
        name: true,
        group: { select: { id: true, name: true } },
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

    // Mapa investimentoId -> meta
    const invMeta = new Map();
    for (const inv of investments) {
      invMeta.set(inv.id, {
        investmentId: inv.id,
        name: inv.name,
        groupId: inv.group?.id || null,
        groupName: inv.group?.name || null,
        clientId: inv.portfolio?.client?.id || null,
        clientName: inv.portfolio?.client?.fullName || null,
        clientEmail: inv.portfolio?.client?.user?.email || null,
      });
    }

    const investmentIds = Array.from(invMeta.keys());
    if (investmentIds.length === 0) {
      return res.json({ ok: true, items: [] });
    }

    // 2) buscar transações relevantes em lote
    // - GAIN/LOSS usam investmentId
    // - TRANSFER usa fromInvestmentId/toInvestmentId
    const txs = await prisma.transaction.findMany({
      where: {
        OR: [
          { investmentId: { in: investmentIds } },
          { fromInvestmentId: { in: investmentIds } },
          { toInvestmentId: { in: investmentIds } },
        ],
        type: { in: ["TRANSFER", "GAIN", "LOSS"] },
      },
      select: {
        type: true,
        amountCents: true,
        investmentId: true,
        fromInvestmentId: true,
        toInvestmentId: true,
      },
    });

    // 3) saldo por investimento
    const balanceByInvestment = new Map(); // investmentId -> cents
    for (const tx of txs) {
      const t = String(tx.type || "").toUpperCase();

      if (t === "GAIN") {
        if (tx.investmentId) add(balanceByInvestment, tx.investmentId, tx.amountCents);
      } else if (t === "LOSS") {
        if (tx.investmentId) add(balanceByInvestment, tx.investmentId, -tx.amountCents);
      } else if (t === "TRANSFER") {
        // cuidado: só aplica se origem/destino forem investimentos não-caixa (já filtrados pelo in:)
        if (tx.fromInvestmentId) add(balanceByInvestment, tx.fromInvestmentId, -tx.amountCents);
        if (tx.toInvestmentId) add(balanceByInvestment, tx.toInvestmentId, tx.amountCents);
      }
    }

    // 4) agrupar por (groupName + investmentName)
    const grouped = new Map(); // key -> aggregate
    for (const [investmentId, meta] of invMeta.entries()) {
      const bal = balanceByInvestment.get(investmentId) || 0;

      const groupName = meta.groupName || "Sem grupo";
      const invName = normalizeName(meta.name);

      const key = `${groupName}|||${invName}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          groupName,
          name: invName,
          totalBalanceCents: 0,
          clientsCount: 0,
          clientsSet: new Set(),
          positions: [],
        });
      }

      const agg = grouped.get(key);
      agg.totalBalanceCents += bal;

      if (meta.clientId && !agg.clientsSet.has(meta.clientId)) {
        agg.clientsSet.add(meta.clientId);
        agg.clientsCount += 1;
      }

      if (includePositions) {
        agg.positions.push({
          clientId: meta.clientId,
          clientName: meta.clientName,
          clientEmail: meta.clientEmail,
          investmentId,
          balanceCents: bal,
        });
      }
    }

    const items = Array.from(grouped.values()).map((x) => {
      const out = {
        groupName: x.groupName,
        name: x.name,
        totalBalanceCents: x.totalBalanceCents,
        clientsCount: x.clientsCount,
      };
      if (includePositions) out.positions = x.positions.sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0));
      return out;
    });

    // ordenar por saldo desc
    items.sort((a, b) => (b.totalBalanceCents || 0) - (a.totalBalanceCents || 0));

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro interno" });
  }
}

module.exports = { listAdminInvestmentsGlobal };