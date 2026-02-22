const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const nameSchema = z.object({
  name: z.string().min(2, "Nome do grupo muito curto").max(60, "Nome muito longo"),
});

// Só pra manter consistência quando rota vier com clientId (atalho)
async function ensureClientExistsIfProvided(req) {
  const clientId = req.params.clientId;
  if (!clientId) return;

  const exists = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!exists) {
    const err = new Error("Cliente não encontrado");
    err.statusCode = 404;
    throw err;
  }
}

async function listGroups(req, res) {
  try {
    await ensureClientExistsIfProvided(req);

    const groups = await prisma.investmentGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    // contagem de uso (pra UI e pra deletar com segurança)
    const counts = await prisma.investment.groupBy({
      by: ["groupId"],
      where: { groupId: { not: null } },
      _count: { _all: true },
    });

    const countMap = new Map();
    for (const row of counts) countMap.set(row.groupId, row._count._all);

    const out = groups.map((g) => ({
      ...g,
      investmentsCount: countMap.get(g.id) || 0,
    }));

    return res.json({ ok: true, groups: out });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

async function createGroup(req, res) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  const name = parsed.data.name.trim();

  try {
    await ensureClientExistsIfProvided(req);

    // tenta criar; se já existir, devolve o existente (idempotente)
    try {
      const group = await prisma.investmentGroup.create({
        data: { name },
        select: { id: true, name: true },
      });
      return res.status(201).json({ ok: true, group });
    } catch (e) {
      if (e?.code === "P2002") {
        const group = await prisma.investmentGroup.findUnique({
          where: { name },
          select: { id: true, name: true },
        });
        return res.status(200).json({ ok: true, group });
      }
      throw e;
    }
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

async function updateGroup(req, res) {
  const groupId = req.params.groupId;

  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Dados inválidos", errors: parsed.error.flatten() });
  }

  const name = parsed.data.name.trim();

  try {
    const exists = await prisma.investmentGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ ok: false, message: "Grupo não encontrado" });

    const updated = await prisma.investmentGroup.update({
      where: { id: groupId },
      data: { name },
      select: { id: true, name: true },
    });

    return res.json({ ok: true, group: updated });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Já existe um grupo com esse nome." });
    }
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

async function deleteGroup(req, res) {
  const groupId = req.params.groupId;

  try {
    const count = await prisma.investment.count({ where: { groupId } });
    if (count > 0) {
      return res.status(409).json({
        ok: false,
        message: "Não é possível excluir: existem investimentos usando este grupo.",
        investmentsCount: count,
      });
    }

    await prisma.investmentGroup.delete({ where: { id: groupId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, message: err.message || "Erro interno" });
  }
}

module.exports = { listGroups, createGroup, updateGroup, deleteGroup };