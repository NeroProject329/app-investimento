const PDFDocument = require("pdfkit");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const querySchema = z.object({
  type: z.enum(["DEPOSIT", "WITHDRAW", "TRANSFER", "GAIN", "LOSS", "ADJUST"]).optional(),
  investmentId: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function monthToRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

function moneyBRL(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function getFilteredTransactions(clientId, query) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    const err = new Error("Query inválida");
    err.statusCode = 400;
    err.errors = parsed.error.flatten();
    throw err;
  }

  const { type, investmentId, month, from, to } = parsed.data;

  const portfolio = await prisma.portfolio.findUnique({
    where: { clientId },
    select: { id: true },
  });
  if (!portfolio) {
    const err = new Error("Portfolio não encontrado");
    err.statusCode = 404;
    throw err;
  }

  const where = { portfolioId: portfolio.id };

  if (type) where.type = type;

  if (investmentId) {
    where.OR = [
      { investmentId },
      { fromInvestmentId: investmentId },
      { toInvestmentId: investmentId },
    ];
  }

  if (month) {
    const { start, end } = monthToRange(month);
    where.occurredAt = { gte: start, lt: end };
  } else if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = new Date(from);
    if (to) where.occurredAt.lte = new Date(to);
  }

  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { occurredAt: "asc" },
    select: {
      occurredAt: true,
      type: true,
      amountCents: true,
      note: true,
      investment: { select: { name: true } },
      fromInv: { select: { name: true } },
      toInv: { select: { name: true } },
      createdBy: { select: { email: true } },
    },
  });

  return txs;
}

async function exportTransactionsCsv(req, res) {
  try {
    const clientId = req.params.clientId;
    const txs = await getFilteredTransactions(clientId, req.query);

    const filename = `transactions-${clientId}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const header = ["date", "type", "amount_brl", "investment", "from", "to", "note", "created_by"].join(",");
    const lines = [header];

    for (const t of txs) {
      lines.push([
        csvEscape(new Date(t.occurredAt).toISOString()),
        csvEscape(t.type),
        csvEscape(moneyBRL(t.amountCents)),
        csvEscape(t.investment?.name || ""),
        csvEscape(t.fromInv?.name || ""),
        csvEscape(t.toInv?.name || ""),
        csvEscape(t.note || ""),
        csvEscape(t.createdBy?.email || ""),
      ].join(","));
    }

    return res.send(lines.join("\n"));
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message, errors: err.errors });
  }
}

async function exportTransactionsPdf(req, res) {
  try {
    const clientId = req.params.clientId;
    const txs = await getFilteredTransactions(clientId, req.query);

    const filename = `transactions-${clientId}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Extrato de Transações", { align: "center" });
    doc.moveDown(1);
    doc.fontSize(10).text(`Cliente: ${clientId}`);
    doc.text(`Gerado em: ${new Date().toISOString()}`);
    doc.moveDown(1);

    doc.fontSize(11);
    for (const t of txs) {
      const dt = new Date(t.occurredAt).toISOString().slice(0, 10);
      const inv = t.investment?.name || "";
      const from = t.fromInv?.name || "";
      const to = t.toInv?.name || "";
      const by = t.createdBy?.email || "";
      const note = t.note ? ` — ${t.note}` : "";

      doc.text(`${dt} | ${t.type} | R$ ${moneyBRL(t.amountCents)} | ${inv}${from ? ` | de: ${from}` : ""}${to ? ` | para: ${to}` : ""}${by ? ` | por: ${by}` : ""}${note}`);
    }

    doc.end();
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message, errors: err.errors });
  }
}

module.exports = { exportTransactionsCsv, exportTransactionsPdf };
