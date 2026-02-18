const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");

const createClientSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional(),
  cpfCnpj: z.string().min(11),
  profile: z.enum(["CONSERVADOR", "MODERADO", "AGRESSIVO"]),
  email: z.string().email(),
  password: z.string().min(8),
});

async function createClient(req, res) {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Dados inválidos",
      errors: parsed.error.flatten(),
    });
  }

  const { fullName, phone, cpfCnpj, profile, email, password } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) cria o user do cliente
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "CLIENT",
          mustChangePassword: true,
        },
        select: { id: true, email: true, role: true, mustChangePassword: true },
      });

      // 2) cria o client vinculado ao user
      const client = await tx.client.create({
        data: {
          userId: user.id,
          fullName,
          phone,
          cpfCnpj,
          profile,
        },
        select: { id: true, fullName: true, cpfCnpj: true, profile: true },
      });

      // 3) cria o portfolio (sem CAIXA ainda)
      const portfolio = await tx.portfolio.create({
        data: { clientId: client.id },
        select: { id: true, clientId: true },
      });

      // 4) cria o investimento CAIXA
      const cash = await tx.investment.create({
        data: {
          portfolioId: portfolio.id,
          name: "CAIXA",
          isCash: true,
        },
        select: { id: true, name: true, isCash: true },
      });

      // 5) atualiza o portfolio setando o cashInvestmentId
      const portfolioUpdated = await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { cashInvestmentId: cash.id },
        select: { id: true, clientId: true, cashInvestmentId: true },
      });

      return { user, client, portfolio: portfolioUpdated, cash };
    });

    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    // Prisma unique constraint
    if (err?.code === "P2002") {
      return res.status(409).json({
        ok: false,
        message: "Já existe um registro com esse valor (email ou cpf/cnpj).",
        meta: err?.meta,
      });
    }

    console.error(err);
    return res.status(500).json({ ok: false, message: "Erro interno ao criar cliente" });
  }
}

async function listClients(req, res) {
  const clients = await prisma.client.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      cpfCnpj: true,
      profile: true,
      phone: true,
      user: { select: { email: true } },
      portfolio: { select: { id: true, cashInvestmentId: true } },
    },
  });

  return res.json({ ok: true, clients });
}

module.exports = { createClient, listClients };
